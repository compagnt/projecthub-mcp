import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerUserTools } from "./tools/user.js";
import { registerWorkspaceTools } from "./tools/workspaces.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerTaskTools } from "./tools/tasks.js";
import { registerTimerTools } from "./tools/timers.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerDiscussionTools } from "./tools/discussions.js";
import { registerReminderTools } from "./tools/reminders.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerLinkTools } from "./tools/links.js";
import { registerFileTools } from "./tools/files.js";
import { registerMemoryTools } from "./tools/memories.js";
import { registerCanvasTools } from "./tools/canvas.js";
import { registerTagTools } from "./tools/tags.js";

export const SERVER_NAME = "projecthub";
export const SERVER_VERSION = "1.0.0";

/** Build a fully-registered ProjectHub MCP server. Shared by the stdio and HTTP entrypoints. */
export function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerUserTools(server);
  registerWorkspaceTools(server);
  registerProjectTools(server);
  registerTaskTools(server);
  registerTimerTools(server);
  registerNoteTools(server);
  registerDiscussionTools(server);
  registerReminderTools(server);
  registerNotificationTools(server);
  registerLinkTools(server);
  registerFileTools(server);
  registerMemoryTools(server);
  registerCanvasTools(server);
  registerTagTools(server);

  return server;
}
