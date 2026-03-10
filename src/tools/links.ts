import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerLinkTools(server: McpServer): void {
  server.registerTool("list_links", {
    description: "List all quick links in a project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const links = await api.get(`/projects/${project_uuid}/links`);
      return toolResult(links);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("create_link", {
    description: "Create a new quick link in a project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      text: z.string().describe("Display text for the link"),
      url: z.string().describe("URL of the link"),
      category: z
        .string()
        .optional()
        .describe("Category to group the link under"),
    },
  }, async ({ project_uuid, ...body }) => {
    try {
      const link = await api.post(
        `/projects/${project_uuid}/links`,
        body as Record<string, unknown>,
      );
      return toolResult(link);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("delete_link", {
    description: "Delete a quick link from a project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      link_uuid: z.string().uuid().describe("UUID of the link to delete"),
    },
  }, async ({ project_uuid, link_uuid }) => {
    try {
      await api.delete(`/projects/${project_uuid}/links/${link_uuid}`);
      return toolResult({ success: true, message: "Link deleted" });
    } catch (error) {
      return toolError(error);
    }
  });
}
