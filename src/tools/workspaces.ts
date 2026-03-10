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

  server.registerTool("create_project", {
    description:
      "Create a new project in a workspace. Requires add_project permission.",
    inputSchema: {
      workspace_uuid: z.string().uuid().describe("UUID of the workspace"),
      name: z.string().describe("Project name"),
      description: z.string().optional().describe("Project description"),
      color: z
        .string()
        .optional()
        .describe("Project color (default: indigo)"),
      icon: z
        .string()
        .optional()
        .describe("Font Awesome icon class (default: fa-folder)"),
    },
  }, async ({ workspace_uuid, ...body }) => {
    try {
      const project = await api.post(
        `/workspaces/${workspace_uuid}/projects`,
        body as Record<string, unknown>,
      );
      return toolResult(project);
    } catch (error) {
      return toolError(error);
    }
  });
}
