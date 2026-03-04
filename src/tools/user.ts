import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { api, toolResult, toolError } from "../api-client.js";

export function registerUserTools(server: McpServer): void {
  server.registerTool("get_user_info", {
    description:
      "Get the authenticated user's profile information (name, email, username)",
  }, async () => {
    try {
      const user = await api.get("/me");
      return toolResult(user);
    } catch (error) {
      return toolError(error);
    }
  });
}
