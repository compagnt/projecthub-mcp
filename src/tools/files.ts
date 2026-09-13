import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

/**
 * File tools. Files live in a project's Files panel (Pro plan: files_enabled)
 * and can be referenced from tasks as attachments. Uploads go through the
 * multipart endpoint; the tool accepts either plain text or base64 so an
 * agent can ship generated documents (reports, CSVs, small images) without
 * a filesystem.
 */
export function registerFileTools(server: McpServer): void {
  server.registerTool("list_files", {
    description:
      "List files in a project (Pro plan). Each file includes `task_uuids` — the tasks it is attached to. Filter with `folder` or `task_uuid`.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      folder: z
        .string()
        .optional()
        .describe('Only files in this folder (use "" for unfiled files)'),
      task_uuid: z
        .string()
        .uuid()
        .optional()
        .describe("Only files attached to this task"),
    },
  }, async ({ project_uuid, folder, task_uuid }) => {
    try {
      const files = await api.get(`/projects/${project_uuid}/files`, {
        folder,
        task: task_uuid,
      });
      return toolResult(files);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("get_file", {
    description:
      "Get one file's metadata (name, size, type, folder, uploader, and the tasks it is attached to).",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      file_uuid: z.string().uuid().describe("UUID of the file"),
    },
  }, async ({ project_uuid, file_uuid }) => {
    try {
      const file = await api.get(`/projects/${project_uuid}/files/${file_uuid}`);
      return toolResult(file);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("upload_file", {
    description:
      "Upload a file into a project's Files panel (Pro plan). Provide the body as `content` (plain text, e.g. a Markdown report or CSV) or `content_base64` (binary such as an image or PDF). Optionally attach it to a task in the same call with `task_uuid`. Keep uploads small (a few MB) — the content travels inside the tool call.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      filename: z
        .string()
        .min(1)
        .describe('File name including extension, e.g. "summary.md"'),
      content: z
        .string()
        .optional()
        .describe("Text content of the file (UTF-8). Use this OR content_base64."),
      content_base64: z
        .string()
        .optional()
        .describe("Base64-encoded binary content. Use this OR content."),
      content_type: z
        .string()
        .optional()
        .describe('MIME type, e.g. "text/markdown" or "image/png" (guessed from the extension if omitted)'),
      name: z
        .string()
        .optional()
        .describe("Display name shown in ProjectHub (defaults to filename)"),
      folder: z
        .string()
        .optional()
        .describe("Folder to file it under (created implicitly)"),
      task_uuid: z
        .string()
        .uuid()
        .optional()
        .describe("Attach the uploaded file to this task"),
    },
  }, async ({ project_uuid, filename, content, content_base64, content_type, name, folder, task_uuid }) => {
    try {
      if ((content === undefined) === (content_base64 === undefined)) {
        throw new Error("Provide exactly one of `content` or `content_base64`.");
      }
      const bytes =
        content_base64 !== undefined
          ? Buffer.from(content_base64, "base64")
          : Buffer.from(content ?? "", "utf8");
      const type = content_type || guessContentType(filename);
      const form = new FormData();
      form.append("file", new Blob([bytes], { type }), filename);
      if (name) form.append("name", name);
      if (folder) form.append("folder", folder);
      if (task_uuid) form.append("task_uuid", task_uuid);
      const file = await api.postForm(`/projects/${project_uuid}/files`, form);
      return toolResult(file);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("delete_file", {
    description:
      "Delete a project file permanently. Allowed for the uploader, or a Project Owner for any file. Any task references to it are removed.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      file_uuid: z.string().uuid().describe("UUID of the file to delete"),
    },
  }, async ({ project_uuid, file_uuid }) => {
    try {
      await api.delete(`/projects/${project_uuid}/files/${file_uuid}`);
      return toolResult({ deleted: true, file_uuid });
    } catch (error) {
      return toolError(error);
    }
  });
}

const MIME_BY_EXT: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  html: "text/html",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
