#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

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

const server = new McpServer({
  name: "projecthub",
  version: "1.0.0",
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

const transport = new StdioServerTransport();
await server.connect(transport);
