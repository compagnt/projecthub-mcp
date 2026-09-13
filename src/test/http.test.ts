import assert from "node:assert/strict";
import { createServer as createHttpServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// The entrypoint reads PROJECTHUB_URL at import time, so the mock must be up first.
const seenAuth: string[] = [];
let projecthub: Server;
let projecthubUrl: string;
let mcp: Server;
let mcpUrl: string;

before(async () => {
  projecthub = createHttpServer((req, res) => {
    const auth = req.headers.authorization ?? "";
    seenAuth.push(auth);
    if (auth !== "Bearer good-token") {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ detail: "Unauthorized" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: 7, username: "tom", email: "tom@example.com" }));
  });
  await new Promise<void>((r) => projecthub.listen(0, "127.0.0.1", r));
  const addr = projecthub.address();
  assert.ok(addr && typeof addr === "object");
  projecthubUrl = `http://127.0.0.1:${addr.port}`;
  process.env.PROJECTHUB_URL = projecthubUrl;
  delete process.env.PROJECTHUB_API_TOKEN;

  const { createApp } = await import("../http.js");
  mcp = createApp().listen(0, "127.0.0.1");
  await new Promise<void>((r) => mcp.once("listening", r));
  const maddr = mcp.address();
  assert.ok(maddr && typeof maddr === "object");
  mcpUrl = `http://127.0.0.1:${maddr.port}`;
});

after(() => {
  mcp?.close();
  projecthub?.close();
});

describe("hosted MCP", () => {
  it("serves the protected-resource metadata unauthenticated", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const res = await fetch(`${mcpUrl}${path}`);
      assert.equal(res.status, 200);
      const doc = (await res.json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] };
      assert.equal(doc.resource, `${mcpUrl}/mcp`);
      assert.deepEqual(doc.authorization_servers, [projecthubUrl]);
      assert.ok(doc.scopes_supported.includes("mcp"));
    }
  });

  it("401s without a token and advertises the metadata URL", async () => {
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(res.status, 401);
    const challenge = res.headers.get("www-authenticate") ?? "";
    assert.match(challenge, /^Bearer /);
    assert.ok(challenge.includes(`resource_metadata="${mcpUrl}/.well-known/oauth-protected-resource"`), challenge);
  });

  it("401s when ProjectHub rejects the token", async () => {
    const res = await fetch(`${mcpUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer bad-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(res.status, 401);
  });

  it("runs tools as the presented token", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(`${mcpUrl}/mcp`), {
      requestInit: { headers: { authorization: "Bearer good-token" } },
    });
    const client = new Client({ name: "test", version: "0" });
    await client.connect(transport);

    const tools = await client.listTools();
    assert.ok(tools.tools.some((t) => t.name === "get_user_info"));

    seenAuth.length = 0;
    const result = await client.callTool({ name: "get_user_info", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    assert.deepEqual(JSON.parse(text), { id: 7, username: "tom", email: "tom@example.com" });
    // The tool's own API call carried the connector's bearer, not a process-wide one.
    assert.ok(seenAuth.includes("Bearer good-token"));
    assert.ok(seenAuth.every((a) => a === "Bearer good-token"));

    await client.close();
  });

  it("rejects GET on the endpoint in stateless mode", async () => {
    const res = await fetch(`${mcpUrl}/mcp`, {
      headers: { authorization: "Bearer good-token", accept: "text/event-stream" },
    });
    assert.equal(res.status, 405);
  });
});
