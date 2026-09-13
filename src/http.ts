#!/usr/bin/env node

/**
 * Hosted (Streamable HTTP) entrypoint — what a Claude Desktop / claude.ai
 * custom connector talks to.
 *
 * Auth model: ProjectHub is the OAuth 2.1 authorization server (its
 * /.well-known/oauth-authorization-server, /oauth/authorize, /oauth/token and
 * /oauth/register endpoints). This service is only a resource server:
 *
 *   1. Unauthenticated requests get a 401 whose WWW-Authenticate header points
 *      at our RFC 9728 protected-resource document, which names ProjectHub as
 *      the authorization server. Claude follows that, registers itself,
 *      sends the user through ProjectHub's consent page, and comes back with
 *      an access token.
 *   2. Every MCP request's bearer token is verified by asking ProjectHub
 *      (GET /api/v1/me) and then forwarded unchanged on each tool's API call,
 *      so tools run as the user who consented. `ph_` personal tokens work too.
 *
 * Stateless: each POST builds its own server + transport, so the service
 * scales horizontally with no sticky sessions.
 */

import { createHash } from "node:crypto";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError, ServerError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { api, PROJECTHUB_URL, ProjectHubError, runWithToken } from "./api-client.js";
import { createServer } from "./server.js";

const PORT = Number(process.env.PORT || 3000);
const MCP_PATH = "/mcp";
const WELL_KNOWN = "/.well-known/oauth-protected-resource";
const SCOPES = ["mcp"];
const RESOURCE_NAME = "ProjectHub MCP";

/** Public URL of this service's MCP endpoint (the RFC 9728 resource identifier). */
const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL?.replace(/\/+$/, "");

/** Seconds a successful token verification is trusted before re-asking ProjectHub. */
const VERIFY_TTL_SECONDS = Number(process.env.MCP_VERIFY_TTL_SECONDS || 60);

// ---------------------------------------------------------------------------
// URL helpers (Railway terminates TLS; honour X-Forwarded-Proto)

function publicOrigin(req: Request): string {
  if (MCP_PUBLIC_URL) return new URL(MCP_PUBLIC_URL).origin;
  return `${req.protocol}://${req.get("host") ?? `localhost:${PORT}`}`;
}

function resourceUrl(req: Request): string {
  return MCP_PUBLIC_URL ?? `${publicOrigin(req)}${MCP_PATH}`;
}

function protectedResourceMetadata(req: Request) {
  return {
    resource: resourceUrl(req),
    authorization_servers: [PROJECTHUB_URL],
    bearer_methods_supported: ["header"],
    scopes_supported: SCOPES,
    resource_name: RESOURCE_NAME,
  };
}

// ---------------------------------------------------------------------------
// Token verification: ask ProjectHub who this token is, cache briefly.

interface VerifiedUser {
  id: number;
  username: string;
  email?: string;
}

const verified = new Map<string, { info: AuthInfo; expiresAt: number }>();

function pruneCache(now: number) {
  if (verified.size < 1000) return;
  for (const [key, entry] of verified) {
    if (entry.expiresAt <= now) verified.delete(key);
  }
}

const projectHubVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const now = Math.floor(Date.now() / 1000);
    const key = createHash("sha256").update(token).digest("hex");
    const cached = verified.get(key);
    if (cached && cached.expiresAt > now) return cached.info;

    let user: VerifiedUser;
    try {
      user = await runWithToken(token, () => api.get<VerifiedUser>("/me"));
    } catch (error) {
      if (error instanceof ProjectHubError && (error.status === 401 || error.status === 403)) {
        throw new InvalidTokenError("ProjectHub rejected the token");
      }
      console.error("token verification failed:", error);
      throw new ServerError("Could not reach ProjectHub to verify the token");
    }

    const expiresAt = now + VERIFY_TTL_SECONDS;
    const info: AuthInfo = {
      token,
      clientId: "projecthub",
      scopes: SCOPES,
      expiresAt,
      extra: { userId: user.id, username: user.username },
    };
    pruneCache(now);
    verified.set(key, { info, expiresAt });
    return info;
  },
};

// ---------------------------------------------------------------------------
// App

const allowedHosts = (process.env.MCP_ALLOWED_HOSTS || "")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.disable("x-powered-by");
  app.use(cors({ exposedHeaders: ["Mcp-Session-Id", "WWW-Authenticate"] }));
  app.use(express.json({ limit: "4mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, projecthub: PROJECTHUB_URL });
  });

  // RFC 9728 discovery document, root form and path-suffix form for /mcp.
  app.get([WELL_KNOWN, `${WELL_KNOWN}${MCP_PATH}`], (req, res) => {
    res.json(protectedResourceMetadata(req));
  });

  const auth = (req: Request, res: Response, next: express.NextFunction) =>
    requireBearerAuth({
      verifier: projectHubVerifier,
      requiredScopes: SCOPES,
      resourceMetadataUrl: `${publicOrigin(req)}${WELL_KNOWN}`,
    })(req, res, next);

  app.post(MCP_PATH, auth, async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableDnsRebindingProtection: allowedHosts.length > 0,
      allowedHosts: allowedHosts.length > 0 ? allowedHosts : undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await runWithToken(req.auth!.token, () =>
        transport.handleRequest(req, res, req.body),
      );
    } catch (error) {
      console.error("mcp request failed:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // Stateless mode: no server-initiated streams or sessions to resume/end.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).set("Allow", "POST").json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  };
  app.get(MCP_PATH, auth, methodNotAllowed);
  app.delete(MCP_PATH, auth, methodNotAllowed);

  return app;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  createApp().listen(PORT, "0.0.0.0", () => {
    console.error(
      `ProjectHub MCP (HTTP) listening on :${PORT}${MCP_PATH} → ${PROJECTHUB_URL}` +
        (MCP_PUBLIC_URL ? ` (public: ${MCP_PUBLIC_URL})` : ""),
    );
  });
}
