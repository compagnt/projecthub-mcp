import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerReminderTools(server: McpServer): void {
  server.registerTool("list_reminders", {
    description:
      "List pending reminders for the current user in a project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const reminders = await api.get(
        `/projects/${project_uuid}/reminders`,
      );
      return toolResult(reminders);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("create_reminder", {
    description:
      "Create a reminder. Title and remind_at are required. remind_at must include timezone.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      title: z.string().describe("Reminder title"),
      notes: z.string().optional().describe("Additional notes"),
      remind_at: z
        .string()
        .describe(
          "When to remind (ISO 8601 with timezone, e.g. 2025-12-15T09:00:00+00:00)",
        ),
      task_uuid: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Link to a specific task"),
      note_uuid: z
        .string()
        .uuid()
        .nullable()
        .optional()
        .describe("Link to a specific note"),
      send_email: z
        .boolean()
        .optional()
        .describe("Send email notification (default: true)"),
      send_in_app: z
        .boolean()
        .optional()
        .describe("Send in-app notification (default: true)"),
    },
  }, async ({ project_uuid, ...body }) => {
    try {
      const reminder = await api.post(
        `/projects/${project_uuid}/reminders`,
        body as Record<string, unknown>,
      );
      return toolResult(reminder);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("dismiss_reminder", {
    description: "Dismiss a reminder (sets its status to dismissed)",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      reminder_uuid: z
        .string()
        .uuid()
        .describe("UUID of the reminder to dismiss"),
    },
  }, async ({ project_uuid, reminder_uuid }) => {
    try {
      await api.delete(
        `/projects/${project_uuid}/reminders/${reminder_uuid}`,
      );
      return toolResult({ success: true, message: "Reminder dismissed" });
    } catch (error) {
      return toolError(error);
    }
  });
}
