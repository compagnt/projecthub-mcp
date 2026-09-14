/**
 * Sources for `upload_file` that don't pass the bytes through the model.
 *
 * - `path`: read from the machine the MCP server runs on. Only meaningful in
 *   stdio mode (Claude Code / Claude Desktop launching this process locally);
 *   in the hosted deployment the server has no access to the user's disk.
 * - `url`: fetched by the server. Works in both modes. Guarded against SSRF:
 *   https only, no private / loopback / link-local targets (checked after DNS
 *   resolution and on every redirect hop), size cap, timeout.
 */

import { promises as dns } from "node:dns";
import { promises as fs } from "node:fs";
import { isIP } from "node:net";
import { basename, resolve } from "node:path";

export interface UploadSource {
  bytes: Buffer;
  /** Best-guess filename when the caller didn't give one. */
  filename: string;
  /** Content type reported by the origin, when there is one. */
  contentType?: string;
}

/** Mirrors ProjectHub's MAX_FILE_UPLOAD_SIZE. Overridable for tests. */
export function maxUploadBytes(): number {
  const env = Number(process.env.PROJECTHUB_MAX_UPLOAD_BYTES);
  return Number.isFinite(env) && env > 0 ? env : 50 * 1024 * 1024;
}

const FETCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// Local path

export async function readLocalFile(inputPath: string): Promise<UploadSource> {
  const abs = resolve(inputPath);
  let stat;
  try {
    stat = await fs.stat(abs);
  } catch {
    throw new Error(`File not found: ${abs}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Not a regular file: ${abs}`);
  }
  const limit = maxUploadBytes();
  if (stat.size > limit) {
    throw new Error(`File is ${stat.size} bytes; the upload limit is ${limit} bytes.`);
  }
  return { bytes: await fs.readFile(abs), filename: basename(abs) };
}

// ---------------------------------------------------------------------------
// Remote URL

/** Tests set this to allow http:// and loopback targets against a local mock. */
function insecureUrlsAllowed(): boolean {
  return process.env.PROJECTHUB_UPLOAD_ALLOW_INSECURE_URLS === "1";
}

function ipv4Octets(ip: string): number[] | null {
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}

/** True for addresses an internet-facing server must never be pointed at. */
export function isDisallowedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) {
    const o = ipv4Octets(ip);
    if (!o) return true;
    const [a, b] = o;
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10/8
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local
      (a === 172 && b >= 16 && b <= 31) || // 172.16/12
      (a === 192 && b === 168) || // 192.168/16
      (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
      a >= 224 // multicast + reserved
    );
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — judge the embedded v4 address.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isDisallowedAddress(mapped[1]);
    if (lower === "::" || lower === "::1") return true;
    const head = parseInt(lower.split(":")[0] || "0", 16);
    return (
      (head & 0xfe00) === 0xfc00 || // fc00::/7 unique local
      (head & 0xffc0) === 0xfe80 || // fe80::/10 link-local
      (head & 0xff00) === 0xff00 // multicast
    );
  }
  return true; // not an IP at all
}

async function assertSafeTarget(url: URL): Promise<void> {
  if (url.protocol !== "https:" && !(insecureUrlsAllowed() && url.protocol === "http:")) {
    throw new Error(`Only https:// URLs can be fetched (got ${url.protocol}//).`);
  }
  if (url.username || url.password) {
    throw new Error("URLs with embedded credentials are not allowed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (insecureUrlsAllowed()) return;
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("Refusing to fetch from localhost.");
  }
  const addresses = isIP(host)
    ? [host]
    : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) {
    throw new Error(`Could not resolve host ${host}.`);
  }
  if (addresses.some(isDisallowedAddress)) {
    throw new Error(`Refusing to fetch ${host}: it resolves to a private or reserved address.`);
  }
}

function filenameFromResponse(res: Response, url: URL): string {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (star) {
    try {
      const name = basename(decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")));
      if (name) return name;
    } catch {
      /* fall through */
    }
  }
  const plain = cd.match(/filename="?([^";]+)"?/i);
  if (plain) {
    const name = basename(plain[1].trim());
    if (name) return name;
  }
  const last = basename(decodeURIComponent(url.pathname));
  return last || "download";
}

export async function fetchRemoteFile(input: string): Promise<UploadSource> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`Invalid URL: ${input}`);
  }

  const limit = maxUploadBytes();
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let res: Response | undefined;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertSafeTarget(url);
    res = await fetch(url, { redirect: "manual", signal, headers: { accept: "*/*" } });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirect from ${url} without a Location header.`);
      await res.body?.cancel();
      url = new URL(location, url); // re-validated on the next iteration
      res = undefined;
      continue;
    }
    break;
  }
  if (!res) throw new Error(`Too many redirects fetching ${input}.`);
  if (!res.ok) throw new Error(`Fetching ${url} failed with HTTP ${res.status}.`);

  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    await res.body?.cancel();
    throw new Error(`Remote file is ${declared} bytes; the upload limit is ${limit} bytes.`);
  }

  const chunks: Buffer[] = [];
  let total = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new Error(`Remote file exceeds the upload limit of ${limit} bytes.`);
      }
      chunks.push(Buffer.from(value));
    }
  }
  if (total === 0) throw new Error(`Remote file at ${url} is empty.`);

  const contentType = res.headers.get("content-type")?.split(";")[0].trim() || undefined;
  return { bytes: Buffer.concat(chunks), filename: filenameFromResponse(res, url), contentType };
}
