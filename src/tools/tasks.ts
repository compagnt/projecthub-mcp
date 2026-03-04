import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerTaskTools(server: McpServer): void {
  server.registerTool("list_tasks", {
    description:
      "List tasks in a project with optional filters for status, assignee, and parent task",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      status: z
        .string()
        .optional()
        .describe(
          "Comma-separated status filter: open, in_progress, done",
        ),
      assignee: z
        .string()
        .optional()
        .describe('"me" to filter to current user only'),
      parent: z
        .string()
        .optional()
        .describe(
          '"none" for top-level only (default), "all" for all tasks, or a task UUID for subtasks',
        ),
    },
  }, async ({ project_uuid, status, assignee, parent }) => {
    try {
      const tasks = await api.get(`/projects/${project_uuid}/tasks`, {
        status,
        assignee,
        parent,
      });
      return toolResult(tasks);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_task", {
    description: "Get details of a specific task",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      task_uuid: z.string().uuid().describe("UUID of the task"),
    },
  }, async ({ project_uuid, task_uuid }) => {
    try {
      const task = await api.get(
        `/projects/${project_uuid}/tasks/${task_uuid}`,
      );
      return toolResult(task);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("create_task", {
    description: "Create a new task in a project. Only title is required.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      title: z.string().describe("Task title"),
      description: z
        .string()
        .optional()
        .describe("Task description (HTML supported)"),
      status: z
        .enum(["open", "in_progress", "done"])
        .optional()
        .describe("Task status (default: open)"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Task priority (default: medium)"),
      start_date: z
        .string()
        .optional()
        .describe("Start date in YYYY-MM-DD format"),
      due_date: z
        .string()
        .optional()
        .describe("Due date in YYYY-MM-DD format"),
      assignee_id: z
        .number()
        .int()
        .optional()
        .describe("User ID to assign (integer, not UUID)"),
      parent_uuid: z
        .string()
        .uuid()
        .optional()
        .describe("UUID of parent task for creating subtasks"),
    },
  }, async ({ project_uuid, ...body }) => {
    try {
      const task = await api.post(
        `/projects/${project_uuid}/tasks`,
        body as Record<string, unknown>,
      );
      return toolResult(task);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("update_task", {
    description:
      "Update a task. Only provided fields are changed. Set assignee_id to 0 to unassign.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      task_uuid: z
        .string()
        .uuid()
        .describe("UUID of the task to update"),
      title: z.string().optional().describe("Updated title"),
      description: z
        .string()
        .optional()
        .describe("Updated description (HTML supported)"),
      status: z
        .enum(["open", "in_progress", "done"])
        .optional()
        .describe("Updated status"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Updated priority"),
      start_date: z
        .string()
        .nullable()
        .optional()
        .describe("Updated start date (YYYY-MM-DD) or null to clear"),
      due_date: z
        .string()
        .nullable()
        .optional()
        .describe("Updated due date (YYYY-MM-DD) or null to clear"),
      assignee_id: z
        .number()
        .int()
        .optional()
        .describe("User ID to assign, or 0 to unassign"),
    },
  }, async ({ project_uuid, task_uuid, ...body }) => {
    try {
      const filteredBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) {
          filteredBody[key] = value;
        }
      }
      const task = await api.patch(
        `/projects/${project_uuid}/tasks/${task_uuid}`,
        filteredBody,
      );
      return toolResult(task);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("delete_task", {
    description: "Delete a task. Requires Project Owner role.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      task_uuid: z
        .string()
        .uuid()
        .describe("UUID of the task to delete"),
    },
  }, async ({ project_uuid, task_uuid }) => {
    try {
      await api.delete(`/projects/${project_uuid}/tasks/${task_uuid}`);
      return toolResult({ success: true, message: "Task deleted" });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("toggle_task", {
    description: "Toggle a task between open and done status",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      task_uuid: z
        .string()
        .uuid()
        .describe("UUID of the task to toggle"),
    },
  }, async ({ project_uuid, task_uuid }) => {
    try {
      const task = await api.post(
        `/projects/${project_uuid}/tasks/${task_uuid}/toggle`,
      );
      return toolResult(task);
    } catch (error) {
      return toolError(error);
    }
  });
}
