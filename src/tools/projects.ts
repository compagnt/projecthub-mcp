import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerProjectTools(server: McpServer): void {
  server.registerTool("get_project", {
    description: "Get details of a specific project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const project = await api.get(`/projects/${project_uuid}`);
      return toolResult(project);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("list_project_members", {
    description: "List members of a project with their roles",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const members = await api.get(`/projects/${project_uuid}/members`);
      return toolResult(members);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("search_project", {
    description:
      "Search across notes, discussions, and messages in a project. Returns up to 4 results per type (note, discussion, message).",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      q: z
        .string()
        .min(3)
        .max(500)
        .describe("Search query (minimum 3 characters)"),
    },
  }, async ({ project_uuid, q }) => {
    try {
      const results = await api.get(`/projects/${project_uuid}/search`, { q });
      return toolResult(results);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_activity", {
    description: "Get the recent activity feed for a project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Maximum entries to return (default: 10, max: 50)"),
    },
  }, async ({ project_uuid, limit }) => {
    try {
      const activity = await api.get(`/projects/${project_uuid}/activity`, {
        limit,
      });
      return toolResult(activity);
    } catch (error) {
      return toolError(error);
    }
  });
}
