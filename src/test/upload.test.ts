import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// ---------------------------------------------------------------------------
// Minimal multipart parser: just enough to pull the `file` part back out.

interface FilePart {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

function parseMultipart(body: Buffer, contentType: string): { file?: FilePart; fields: Record<string, string> } {
  const boundary = contentType.match(/boundary=(.+)$/)?.[1];
  assert.ok(boundary, "multipart boundary present");
  const delim = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  let file: FilePart | undefined;
  let pos = body.indexOf(delim);
  while (pos !== -1) {
    const next = body.indexOf(delim, pos + delim.length);
    if (next === -1) break;
    const part = body.subarray(pos + delim.length + 2, next - 2); // strip CRLF after delim and before next
    const headerEnd = part.indexOf("\r\n\r\n");
    const headers = part.subarray(0, headerEnd).toString();
    const data = part.subarray(headerEnd + 4);
    const name = headers.match(/name="([^"]+)"/)?.[1] ?? "";
    const filename = headers.match(/filename="([^"]+)"/)?.[1];
    if (filename !== undefined) {
      file = { filename, contentType: headers.match(/Content-Type: (.+)/i)?.[1].trim() ?? "", bytes: Buffer.from(data) };
    } else {
      fields[name] = data.toString();
    }
    pos = next;
  }
  return { file, fields };
}

// ---------------------------------------------------------------------------

interface Upload {
  file?: FilePart;
  fields: Record<string, string>;
}

const uploads: Upload[] = [];
let projecthub: Server;
let origin: Server; // serves files for the `url` source
let originUrl: string;
let client: Client;
let tmp: string;

before(async () => {
  projecthub = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    uploads.push(parseMultipart(Buffer.concat(chunks), req.headers["content-type"] ?? ""));
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ unique_id: "11111111-1111-1111-1111-111111111111", name: "ok" }));
  });
  await new Promise<void>((r) => projecthub.listen(0, "127.0.0.1", r));
  const addr = projecthub.address();
  assert.ok(addr && typeof addr === "object");
  process.env.PROJECTHUB_URL = `http://127.0.0.1:${addr.port}`;
  process.env.PROJECTHUB_API_TOKEN = "ph_test";

  origin = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/exports/design.png" });
      res.end();
      return;
    }
    if (req.url === "/exports/design.png") {
      res.writeHead(200, { "content-type": "image/png", "content-disposition": 'attachment; filename="s1-design.png"' });
      res.end(originBytes);
      return;
    }
    if (req.url === "/big") {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": String(10 * 1024 * 1024) });
      res.end(Buffer.alloc(16));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => origin.listen(0, "127.0.0.1", r));
  const oaddr = origin.address();
  assert.ok(oaddr && typeof oaddr === "object");
  originUrl = `http://127.0.0.1:${oaddr.port}`;

  tmp = await fs.mkdtemp(join(tmpdir(), "ph-upload-"));

  const { createServer: createMcp } = await import("../server.js");
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await createMcp().connect(st);
  client = new Client({ name: "test", version: "0" });
  await client.connect(ct);
});

after(async () => {
  await client?.close();
  projecthub?.close();
  origin?.close();
  await fs.rm(tmp, { recursive: true, force: true });
});

afterEach(async () => {
  uploads.length = 0;
  delete process.env.PROJECTHUB_UPLOAD_ALLOW_INSECURE_URLS;
  delete process.env.PROJECTHUB_MAX_UPLOAD_BYTES;
  const { setTransportMode } = await import("../api-client.js");
  setTransportMode("stdio");
});

const originBytes = randomBytes(200 * 1024);
const PROJECT = "22222222-2222-2222-2222-222222222222";

async function upload(args: Record<string, unknown>) {
  const result = await client.callTool({ name: "upload_file", arguments: { project_uuid: PROJECT, ...args } });
  const text = (result.content as Array<{ type: string; text: string }>)[0].text;
  return { isError: result.isError === true, text };
}

describe("upload_file sources", () => {
  it("uploads a local file by path without passing bytes through the model", async () => {
    const bytes = randomBytes(3 * 1024 * 1024); // far larger than any inline body
    const path = join(tmp, "bundle.js");
    await fs.writeFile(path, bytes);

    const r = await upload({ path, folder: "Exports", task_uuid: "33333333-3333-3333-3333-333333333333" });
    assert.equal(r.isError, false, r.text);
    assert.equal(uploads.length, 1);
    const { file, fields } = uploads[0];
    assert.ok(file);
    assert.equal(file.filename, "bundle.js");
    assert.equal(file.contentType, "text/javascript");
    assert.equal(file.bytes.length, bytes.length);
    assert.ok(file.bytes.equals(bytes), "uploaded bytes identical to the file on disk");
    assert.equal(fields.folder, "Exports");
    assert.equal(fields.task_uuid, "33333333-3333-3333-3333-333333333333");
  });

  it("lets filename override the on-disk name", async () => {
    const path = join(tmp, "raw.dat");
    await fs.writeFile(path, "hello");
    const r = await upload({ path, filename: "notes.md" });
    assert.equal(r.isError, false, r.text);
    assert.equal(uploads[0].file?.filename, "notes.md");
    assert.equal(uploads[0].file?.contentType, "text/markdown");
  });

  it("refuses path when the server is hosted", async () => {
    const { setTransportMode } = await import("../api-client.js");
    setTransportMode("http");
    const r = await upload({ path: join(tmp, "raw.dat") });
    assert.equal(r.isError, true);
    assert.match(r.text, /hosted connector/);
    assert.equal(uploads.length, 0);
  });

  it("reports a missing path and an over-limit file", async () => {
    let r = await upload({ path: join(tmp, "nope.txt") });
    assert.equal(r.isError, true);
    assert.match(r.text, /File not found/);

    process.env.PROJECTHUB_MAX_UPLOAD_BYTES = "4";
    r = await upload({ path: join(tmp, "raw.dat") }); // 5 bytes
    assert.equal(r.isError, true);
    assert.match(r.text, /upload limit is 4 bytes/);
    assert.equal(uploads.length, 0);
  });

  it("downloads from a url, following redirects and honouring content-disposition", async () => {
    process.env.PROJECTHUB_UPLOAD_ALLOW_INSECURE_URLS = "1";
    const r = await upload({ url: `${originUrl}/redirect` });
    assert.equal(r.isError, false, r.text);
    const { file } = uploads[0];
    assert.ok(file);
    assert.equal(file.filename, "s1-design.png");
    assert.equal(file.contentType, "image/png");
    assert.ok(file.bytes.equals(originBytes));
  });

  it("rejects an over-limit remote file before downloading it", async () => {
    process.env.PROJECTHUB_UPLOAD_ALLOW_INSECURE_URLS = "1";
    process.env.PROJECTHUB_MAX_UPLOAD_BYTES = String(1024 * 1024);
    const r = await upload({ url: `${originUrl}/big` });
    assert.equal(r.isError, true);
    assert.match(r.text, /upload limit/);
    assert.equal(uploads.length, 0);
  });

  it("refuses non-https and private targets", async () => {
    let r = await upload({ url: `${originUrl}/exports/design.png` }); // http://, no override
    assert.equal(r.isError, true);
    assert.match(r.text, /Only https/);

    r = await upload({ url: "https://localhost/file.bin" });
    assert.equal(r.isError, true);
    assert.match(r.text, /localhost/);

    r = await upload({ url: "https://10.0.0.5/file.bin" });
    assert.equal(r.isError, true);
    assert.match(r.text, /private or reserved/);

    r = await upload({ url: "https://user:pw@example.com/file.bin" });
    assert.equal(r.isError, true);
    assert.match(r.text, /credentials/);
    assert.equal(uploads.length, 0);
  });

  it("requires exactly one source and a filename for inline content", async () => {
    let r = await upload({});
    assert.equal(r.isError, true);
    assert.match(r.text, /exactly one/);

    r = await upload({ content: "a", url: "https://example.com/x" });
    assert.equal(r.isError, true);
    assert.match(r.text, /exactly one/);

    r = await upload({ content: "# hi" });
    assert.equal(r.isError, true);
    assert.match(r.text, /filename.*required/);

    r = await upload({ content: "# hi", filename: "hi.md" });
    assert.equal(r.isError, false, r.text);
    assert.equal(uploads[0].file?.bytes.toString(), "# hi");
  });
});

describe("isDisallowedAddress", () => {
  it("classifies addresses", async () => {
    const { isDisallowedAddress } = await import("../upload-sources.js");
    for (const bad of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"]) {
      assert.equal(isDisallowedAddress(bad), true, bad);
    }
    for (const ok of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
      assert.equal(isDisallowedAddress(ok), false, ok);
    }
  });
});
