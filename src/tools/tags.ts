import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

const colorEnum = z
  .enum(["indigo", "blue", "green", "yellow", "orange", "red", "pink", "purple", "gray"])
  .describe("Tag colour preset");

/**
 * Tag tools — named, coloured labels scoped to a project (e.g. "July Release").
 * Tags can be attached to tasks and notes via the `tags` field on the
 * create/update task/note tools, and filtered with their `tag` parameter.
 */
export function registerTagTools(server: McpServer): void {
  server.registerTool("list_tags", {
    description:
      "List the tags defined in a project, with how many things each tag is attached to. Use this to discover existing tags before tagging something, so you reuse a tag instead of creating a near-duplicate.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      q: z.string().optional().describe("Filter tags by name substring"),
    },
  }, async ({ project_uuid, q }) => {
    try {
      const tags = await api.get(`/projects/${project_uuid}/tags`, { q });
      return toolResult(tags);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("create_tag", {
    description:
      "Create a tag in a project. Names are unique per project (case-insensitive). Note: you usually don't need this — passing `tags: [\"July Release\"]` to create_task/update_task/create_note/update_note auto-creates any tag that doesn't exist yet. Use this when you want to control the colour.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      name: z.string().min(1).max(50).describe('Tag name (e.g. "July Release")'),
      color: colorEnum.optional().describe("Colour preset (default indigo)"),
    },
  }, async ({ project_uuid, name, color }) => {
    try {
      const tag = await api.post(`/projects/${project_uuid}/tags`, { name, color });
      return toolResult(tag);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("update_tag", {
    description:
      "Rename or recolour a tag. Renaming updates it everywhere it's used. Only provided fields change.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      tag_uuid: z.string().uuid().describe("UUID of the tag"),
      name: z.string().min(1).max(50).optional().describe("New name"),
      color: colorEnum.optional().describe("New colour preset"),
    },
  }, async ({ project_uuid, tag_uuid, name, color }) => {
    try {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (color !== undefined) body.color = color;
      const tag = await api.patch(`/projects/${project_uuid}/tags/${tag_uuid}`, body);
      return toolResult(tag);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("delete_tag", {
    description:
      "Delete a tag from a project. It is removed from every task and note it was attached to. The tagged items themselves are NOT deleted.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      tag_uuid: z.string().uuid().describe("UUID of the tag"),
    },
  }, async ({ project_uuid, tag_uuid }) => {
    try {
      await api.delete(`/projects/${project_uuid}/tags/${tag_uuid}`);
      return toolResult({ success: true, message: "Tag deleted" });
    } catch (error) {
      return toolError(error);
    }
  });
}
