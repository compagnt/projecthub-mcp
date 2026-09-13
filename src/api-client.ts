import { AsyncLocalStorage } from "node:async_hooks";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const PROJECTHUB_URL = (
  process.env.PROJECTHUB_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const BASE_URL = `${PROJECTHUB_URL}/api/v1`;

/**
 * Which ProjectHub credential a request runs as.
 *
 * - stdio mode: one token for the whole process, from PROJECTHUB_API_TOKEN.
 * - HTTP mode: the bearer token Claude presented on the incoming MCP request
 *   (an OAuth access token minted by ProjectHub, or a `ph_` personal token),
 *   forwarded unchanged. `runWithToken` binds it for the duration of that
 *   request; every tool call inside reads it back here without the 47 tool
 *   files knowing anything about transports.
 */
const tokenContext = new AsyncLocalStorage<string>();

export function runWithToken<T>(token: string, fn: () => T): T {
  return tokenContext.run(token, fn);
}

function currentToken(): string {
  const token = tokenContext.getStore() ?? process.env.PROJECTHUB_API_TOKEN;
  if (!token) {
    throw new ProjectHubError(
      401,
      "No ProjectHub credential available for this request",
    );
  }
  return token;
}

export class ProjectHubError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ProjectHubError";
  }
}

async function request<T = unknown>(
  method: string,
  path: string,
  options?: {
    params?: Record<string, string | number | boolean | undefined>;
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const normalizedPath = path.replace(/\/+$/, "");
  const url = new URL(`${BASE_URL}${normalizedPath}`);
  if (options?.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${currentToken()}`,
    Accept: "application/json",
  };

  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = await response.json();

  if (!response.ok) {
    const detail =
      (data as { detail?: string }).detail || `HTTP ${response.status}`;
    throw new ProjectHubError(response.status, detail);
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
  ) => request<T>("GET", path, { params }),

  post: <T = unknown>(path: string, body?: Record<string, unknown>) =>
    request<T>("POST", path, { body }),

  patch: <T = unknown>(path: string, body?: Record<string, unknown>) =>
    request<T>("PATCH", path, { body }),

  delete: <T = unknown>(path: string) => request<T>("DELETE", path),
};

function prune(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prune);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === null || entry === "") continue;
      result[key] = prune(entry);
    }
    return result;
  }
  return value;
}

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(prune(data)) }],
  };
}

export function toolError(error: unknown): CallToolResult {
  const message =
    error instanceof ProjectHubError
      ? `ProjectHub API error (${error.status}): ${error.detail}`
      : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}
