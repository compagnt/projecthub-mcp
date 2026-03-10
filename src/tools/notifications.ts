import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerNotificationTools(server: McpServer): void {
  server.registerTool("list_notifications", {
    description:
      "List notifications for the current user. Returns unread only by default.",
    inputSchema: {
      unread_only: z
        .boolean()
        .optional()
        .describe("Only return unread notifications (default: true)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Max notifications to return (default: 20, max: 100)"),
    },
  }, async ({ unread_only, limit }) => {
    try {
      const notifications = await api.get("/notifications", {
        unread_only,
        limit,
      });
      return toolResult(notifications);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("mark_notification_read", {
    description: "Mark a notification as read",
    inputSchema: {
      notification_id: z.number().int().describe("ID of the notification"),
    },
  }, async ({ notification_id }) => {
    try {
      const result = await api.post(
        `/notifications/${notification_id}/read`,
      );
      return toolResult(result);
    } catch (error) {
      return toolError(error);
    }
  });
}
