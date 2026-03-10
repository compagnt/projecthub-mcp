import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerFileTools(server: McpServer): void {
  server.registerTool("list_files", {
    description:
      "List all files in a project. Requires files_enabled plan feature.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const files = await api.get(`/projects/${project_uuid}/files`);
      return toolResult(files);
    } catch (error) {
      return toolError(error);
    }
  });
}
