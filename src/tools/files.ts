import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, isHosted, toolResult, toolError } from "../api-client.js";
import { fetchRemoteFile, readLocalFile } from "../upload-sources.js";

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
      "Upload a file into a project's Files panel (Pro plan). Give the body in exactly ONE of four ways: " +
      "`path` (a file on this machine — only when the MCP server runs locally via stdio; the bytes never pass through the model, so large files are fine), " +
      "`url` (an https URL the server downloads — works everywhere, incl. the hosted connector), " +
      "`content` (plain UTF-8 text you generate, e.g. a Markdown report or CSV), or " +
      "`content_base64` (small binary you generate). Inline `content`/`content_base64` travel inside the tool call, so keep them to tens of KB; for anything bigger use `path` or `url`. " +
      "Optionally attach the file to a task in the same call with `task_uuid`. Server-side limit is 50 MB.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      path: z
        .string()
        .optional()
        .describe("Absolute (or cwd-relative) path of a file on the machine running this MCP server. Local/stdio mode only."),
      url: z
        .string()
        .optional()
        .describe("https URL to download the file from. Private/internal addresses are refused."),
      content: z
        .string()
        .optional()
        .describe("Text content of the file (UTF-8), for small generated files."),
      content_base64: z
        .string()
        .optional()
        .describe("Base64-encoded binary content, for small generated files."),
      filename: z
        .string()
        .optional()
        .describe('File name including extension, e.g. "summary.md". Required with content/content_base64; defaults to the source\'s name for path/url.'),
      content_type: z
        .string()
        .optional()
        .describe('MIME type, e.g. "text/markdown" or "image/png" (guessed from the filename / origin if omitted)'),
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
  }, async ({ project_uuid, path, url, content, content_base64, filename, content_type, name, folder, task_uuid }) => {
    try {
      const given = [path, url, content, content_base64].filter((v) => v !== undefined).length;
      if (given !== 1) {
        throw new Error("Provide exactly one of `path`, `url`, `content` or `content_base64`.");
      }

      let bytes: Buffer;
      let sourceName: string | undefined;
      let sourceType: string | undefined;
      if (path !== undefined) {
        if (isHosted()) {
          throw new Error(
            "`path` only works when the MCP server runs on your machine (stdio). This is the hosted connector — use `url`, or upload through the ProjectHub UI.",
          );
        }
        ({ bytes, filename: sourceName } = await readLocalFile(path));
      } else if (url !== undefined) {
        ({ bytes, filename: sourceName, contentType: sourceType } = await fetchRemoteFile(url));
      } else if (content_base64 !== undefined) {
        bytes = Buffer.from(content_base64, "base64");
      } else {
        bytes = Buffer.from(content ?? "", "utf8");
      }

      const finalName = (filename ?? sourceName ?? "").trim();
      if (!finalName) {
        throw new Error("`filename` is required with `content` / `content_base64`.");
      }
      const type =
        content_type ||
        (sourceType && sourceType !== "application/octet-stream" ? sourceType : undefined) ||
        guessContentType(finalName);

      const form = new FormData();
      form.append("file", new Blob([bytes], { type }), finalName);
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
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/plain",
  py: "text/x-python",
  sql: "application/sql",
  log: "text/plain",
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
  gz: "application/gzip",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function guessContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}
