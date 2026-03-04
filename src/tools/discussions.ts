import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerDiscussionTools(server: McpServer): void {
  server.registerTool("list_discussions", {
    description: "List all discussions (chat rooms) in a project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const discussions = await api.get(
        `/projects/${project_uuid}/discussions`,
      );
      return toolResult(discussions);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_discussion_messages", {
    description:
      "Get messages from a discussion in chronological order. Discussions are read-only via the API.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      discussion_uuid: z
        .string()
        .uuid()
        .describe("UUID of the discussion"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max messages to return (default: 50, max: 200)"),
      before: z
        .string()
        .optional()
        .describe(
          "ISO 8601 datetime for pagination — get messages before this time",
        ),
    },
  }, async ({ project_uuid, discussion_uuid, limit, before }) => {
    try {
      const messages = await api.get(
        `/projects/${project_uuid}/discussions/${discussion_uuid}/messages`,
        { limit, before },
      );
      return toolResult(messages);
    } catch (error) {
      return toolError(error);
    }
  });
}
