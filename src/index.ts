#!/usr/bin/env node

// stdio entrypoint: one process per Claude client, authenticated with a single
// personal access token from the environment. For the hosted / Claude Desktop
// custom-connector deployment, see http.ts.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer } from "./server.js";

if (!process.env.PROJECTHUB_API_TOKEN) {
  console.error("PROJECTHUB_API_TOKEN environment variable is required");
  process.exit(1);
}

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
