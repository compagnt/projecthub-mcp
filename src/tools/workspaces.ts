import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerWorkspaceTools(server: McpServer): void {
  server.registerTool("list_workspaces", {
    description: "List all workspaces the authenticated user belongs to",
  }, async () => {
    try {
      const workspaces = await api.get("/workspaces");
      return toolResult(workspaces);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("list_projects", {
    description: "List projects in a workspace that the user is a member of",
    inputSchema: {
      workspace_uuid: z.string().uuid().describe("UUID of the workspace"),
      include_archived: z
        .boolean()
        .optional()
        .describe("Include archived projects (default: false)"),
    },
  }, async ({ workspace_uuid, include_archived }) => {
    try {
      const projects = await api.get(
        `/workspaces/${workspace_uuid}/projects`,
        { include_archived },
      );
      return toolResult(projects);
    } catch (error) {
      return toolError(error);
    }
  });
}
