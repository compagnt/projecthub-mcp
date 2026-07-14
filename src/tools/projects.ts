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
      "Search across notes, tasks, discussions, messages, and memories in a project. Strong multi-term keyword matching (every word must match; order-independent); semantic search is also used for embedded types on Pro plans. Returns up to 4 results per type. Pass `type` to restrict to one entity type (e.g. 'task').",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      q: z
        .string()
        .min(3)
        .max(500)
        .describe("Search query (minimum 3 characters)"),
      type: z
        .enum(["note", "task", "discussion", "message", "memory"])
        .optional()
        .describe("Restrict results to a single entity type"),
    },
  }, async ({ project_uuid, q, type }) => {
    try {
      const results = await api.get(`/projects/${project_uuid}/search`, { q, type });
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
