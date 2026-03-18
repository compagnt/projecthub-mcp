import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

const categoryEnum = z
  .enum(["decision", "preference", "context", "reference", "lesson", "other"])
  .describe("Memory category");

export function registerMemoryTools(server: McpServer): void {
  server.registerTool("list_memories", {
    description:
      "List memories (AI-generated knowledge items) in a project. Memories capture decisions, preferences, context, references, and lessons that persist across conversations.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      category: categoryEnum.optional().describe("Filter by category"),
      is_pinned: z
        .boolean()
        .optional()
        .describe("Filter by pinned status"),
      source: z
        .string()
        .optional()
        .describe("Filter by source (e.g. 'claude-code', 'mcp-server')"),
    },
  }, async ({ project_uuid, category, is_pinned, source }) => {
    try {
      const memories = await api.get(`/projects/${project_uuid}/memories`, {
        category,
        is_pinned,
        source,
      });
      return toolResult(memories);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_memory", {
    description: "Get a single memory with its full content",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      memory_uuid: z.string().uuid().describe("UUID of the memory"),
    },
  }, async ({ project_uuid, memory_uuid }) => {
    try {
      const memory = await api.get(
        `/projects/${project_uuid}/memories/${memory_uuid}`,
      );
      return toolResult(memory);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("create_memory", {
    description:
      "Create a new memory in a project. Memories are AI-generated knowledge items — decisions, preferences, context, references, or lessons — that persist across conversations. Humans can view them in the platform.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      title: z.string().describe("Short descriptive title for the memory"),
      content: z
        .string()
        .describe("Memory content in plain text"),
      category: categoryEnum,
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization and search"),
      source: z
        .string()
        .optional()
        .describe("Source identifier (e.g. 'claude-code', 'mcp-server')"),
      is_pinned: z
        .boolean()
        .optional()
        .describe("Pin memory for higher visibility (default: false)"),
      is_workspace_wide: z
        .boolean()
        .optional()
        .describe(
          "Make memory visible across all projects in the workspace (default: false)",
        ),
    },
  }, async ({ project_uuid, ...body }) => {
    try {
      const memory = await api.post(
        `/projects/${project_uuid}/memories`,
        body as Record<string, unknown>,
      );
      return toolResult(memory);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("update_memory", {
    description:
      "Update a memory. Only provided fields are changed (partial update).",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      memory_uuid: z
        .string()
        .uuid()
        .describe("UUID of the memory to update"),
      title: z.string().optional().describe("Updated title"),
      content: z
        .string()
        .optional()
        .describe("Updated content (plain text)"),
      category: categoryEnum.optional().describe("Updated category"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Updated tags (replaces existing tags)"),
      source: z.string().optional().describe("Updated source identifier"),
      is_pinned: z.boolean().optional().describe("Updated pinned status"),
      is_workspace_wide: z
        .boolean()
        .optional()
        .describe("Updated workspace-wide visibility"),
    },
  }, async ({ project_uuid, memory_uuid, ...body }) => {
    try {
      const filteredBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) {
          filteredBody[key] = value;
        }
      }
      const memory = await api.patch(
        `/projects/${project_uuid}/memories/${memory_uuid}`,
        filteredBody,
      );
      return toolResult(memory);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("delete_memory", {
    description: "Delete a memory from a project",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      memory_uuid: z
        .string()
        .uuid()
        .describe("UUID of the memory to delete"),
    },
  }, async ({ project_uuid, memory_uuid }) => {
    try {
      await api.delete(`/projects/${project_uuid}/memories/${memory_uuid}`);
      return toolResult({ success: true, message: "Memory deleted" });
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("list_workspace_memories", {
    description:
      "List memories across all projects in a workspace. Useful for retrieving workspace-wide knowledge and context.",
    inputSchema: {
      workspace_uuid: z.string().uuid().describe("UUID of the workspace"),
      category: categoryEnum.optional().describe("Filter by category"),
      source: z
        .string()
        .optional()
        .describe("Filter by source (e.g. 'claude-code', 'mcp-server')"),
    },
  }, async ({ workspace_uuid, category, source }) => {
    try {
      const memories = await api.get(
        `/workspaces/${workspace_uuid}/memories`,
        { category, source },
      );
      return toolResult(memories);
    } catch (error) {
      return toolError(error);
    }
  });
}
