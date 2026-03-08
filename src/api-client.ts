import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const PROJECTHUB_URL = process.env.PROJECTHUB_URL || "http://localhost:8000";
const API_TOKEN = process.env.PROJECTHUB_API_TOKEN;
const BASE_URL = `${PROJECTHUB_URL.replace(/\/+$/, "")}/api/v1`;

if (!API_TOKEN) {
  console.error("PROJECTHUB_API_TOKEN environment variable is required");
  process.exit(1);
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
    Authorization: `Bearer ${API_TOKEN}`,
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

export function toolResult(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
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
