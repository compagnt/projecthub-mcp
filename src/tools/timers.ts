import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerTimerTools(server: McpServer): void {
  server.registerTool("start_timer", {
    description:
      "Start a time tracking timer on a task. Automatically stops any other running timer.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      task_uuid: z.string().uuid().describe("UUID of the task"),
    },
  }, async ({ project_uuid, task_uuid }) => {
    try {
      const result = await api.post(
        `/projects/${project_uuid}/tasks/${task_uuid}/timer/start`,
      );
      return toolResult(result);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("stop_timer", {
    description: "Stop the running time tracking timer on a task",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      task_uuid: z.string().uuid().describe("UUID of the task"),
    },
  }, async ({ project_uuid, task_uuid }) => {
    try {
      const result = await api.post(
        `/projects/${project_uuid}/tasks/${task_uuid}/timer/stop`,
      );
      return toolResult(result);
    } catch (error) {
      return toolError(error);
    }
  });
}
