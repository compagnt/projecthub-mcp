import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { api, toolResult, toolError } from "../api-client.js";

/**
 * Canvas tools — the project's shared infinite canvas. Notes can be placed on it
 * as movable, resizable cards with (x, y) world coordinates, a width/height, and
 * a z-index (stacking order). Positions are SHARED across the project: every
 * member (and every agent) sees the same arrangement, and changes broadcast live.
 *
 * Spatial proximity is meaningful — notes placed near each other usually relate.
 * Use these tools to read how the human has organized the board and to arrange
 * notes you create (e.g. place related notes in a cluster).
 */
export function registerCanvasTools(server: McpServer): void {
  server.registerTool("list_canvas_items", {
    description:
      "List the notes placed on the project's shared canvas, with their positions (x, y), sizes (width, height), and stacking order (z). Use this to understand how the board is spatially organized before placing or arranging notes.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
    },
  }, async ({ project_uuid }) => {
    try {
      const items = await api.get(`/projects/${project_uuid}/canvas/items`);
      return toolResult(items);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("place_on_canvas", {
    description:
      "Place a note on the shared canvas at an (x, y) world coordinate. Idempotent — if the note is already on the canvas, returns its existing placement. Returns the placement (including its `item` id used by move/remove). Coordinates are in pixels; new notes default near the top-left. Place related notes near each other.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      note_uuid: z.string().uuid().describe("UUID of the note to place"),
      x: z.number().optional().describe("World x coordinate in px (default 80)"),
      y: z.number().optional().describe("World y coordinate in px (default 80)"),
    },
  }, async ({ project_uuid, note_uuid, x, y }) => {
    try {
      const item = await api.post(`/projects/${project_uuid}/canvas/place`, {
        note_uuid,
        x,
        y,
      });
      return toolResult(item);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("move_canvas_item", {
    description:
      "Move and/or resize a placed canvas item. Pass the placement's `item` id (from list_canvas_items or place_on_canvas), not the note id. Only provided fields change. Use `z` to restack (higher = front). Width/height are clamped to a minimum.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      item_uuid: z
        .string()
        .uuid()
        .describe("UUID of the canvas placement (the `item` field), not the note"),
      x: z.number().optional().describe("New world x coordinate in px"),
      y: z.number().optional().describe("New world y coordinate in px"),
      width: z.number().optional().describe("New width in px"),
      height: z.number().optional().describe("New height in px"),
      z: z.number().int().optional().describe("New stacking order (higher = front)"),
    },
  }, async ({ project_uuid, item_uuid, x, y, width, height, z }) => {
    try {
      const item = await api.patch(
        `/projects/${project_uuid}/canvas/item/${item_uuid}`,
        { x, y, width, height, z },
      );
      return toolResult(item);
    } catch (error) {
      return toolError(error);
    }
  });

  server.registerTool("remove_from_canvas", {
    description:
      "Remove a note's placement from the canvas. The underlying note is NOT deleted — it just leaves the board. Pass the placement's `item` id, not the note id.",
    inputSchema: {
      project_uuid: z.string().uuid().describe("UUID of the project"),
      item_uuid: z
        .string()
        .uuid()
        .describe("UUID of the canvas placement (the `item` field), not the note"),
    },
  }, async ({ project_uuid, item_uuid }) => {
    try {
      await api.delete(`/projects/${project_uuid}/canvas/item/${item_uuid}`);
      return toolResult({ success: true, message: "Removed from canvas" });
    } catch (error) {
      return toolError(error);
    }
  });
}
