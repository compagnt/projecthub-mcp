import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

export function registerNoteTools(server: McpServer): void {
  server.registerTool("list_notes", {
    description:
      "List all notes in a project, ordered by pinned first then newest",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const notes = await api.get(`/projects/${project_uuid}/notes`);
      return toolResult(notes);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_note", {
    description: "Get a single note with its full content",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      note_uuid: z.string().uuid().describe("UUID of the note"),
    },
  }, async ({ project_uuid, note_uuid }) => {
    try {
      const note = await api.get(
        `/projects/${project_uuid}/notes/${note_uuid}`,
      );
      return toolResult(note);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("create_note", {
    description: "Create a new note in a project. Only title is required.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      title: z.string().describe("Note title"),
      text: z
        .string()
        .optional()
        .describe("Note content (HTML supported)"),
      color: z
        .enum(["yellow", "blue", "green", "pink", "purple"])
        .optional()
        .describe("Note color (default: yellow)"),
    },
  }, async ({ project_uuid, ...body }) => {
    try {
      const note = await api.post(
        `/projects/${project_uuid}/notes`,
        body as Record<string, unknown>,
      );
      return toolResult(note);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("update_note", {
    description: "Update a note. Only provided fields are changed.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      note_uuid: z
        .string()
        .uuid()
        .describe("UUID of the note to update"),
      title: z.string().optional().describe("Updated title"),
      text: z
        .string()
        .optional()
        .describe("Updated content (HTML supported)"),
      color: z
        .enum(["yellow", "blue", "green", "pink", "purple"])
        .optional()
        .describe("Updated color"),
    },
  }, async ({ project_uuid, note_uuid, ...body }) => {
    try {
      const filteredBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) {
          filteredBody[key] = value;
        }
      }
      const note = await api.patch(
        `/projects/${project_uuid}/notes/${note_uuid}`,
        filteredBody,
      );
      return toolResult(note);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("delete_note", {
    description:
      "Delete a note. Requires being the creator or having delete permission.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      note_uuid: z
        .string()
        .uuid()
        .describe("UUID of the note to delete"),
    },
  }, async ({ project_uuid, note_uuid }) => {
    try {
      await api.delete(`/projects/${project_uuid}/notes/${note_uuid}`);
      return toolResult({ success: true, message: "Note deleted" });
    } catch (error) {
      return toolError(error);
    }
  });
}
