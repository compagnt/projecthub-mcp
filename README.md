# ProjectHub MCP Server

An MCP (Model Context Protocol) server that connects AI assistants like Claude Desktop to [ProjectHub](https://github.com/your-org/projecthub), a collaborative project management tool.

## Features

56 tools covering the full ProjectHub API:

| Category | Tools |
|----------|-------|
| **User** | `get_user_info` |
| **Workspaces** | `list_workspaces`, `list_projects`, `create_project` |
| **Projects** | `get_project`, `list_project_members`, `search_project`, `get_activity` |
| **Tasks** | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`, `toggle_task` (create/update accept `attachment_uuids`; update accepts `comment`) |
| **Task comments** | `list_task_comments`, `add_task_comment`, `update_task_comment`, `delete_task_comment` |
| **Time Tracking** | `start_timer`, `stop_timer` |
| **Notes** | `list_notes`, `get_note`, `create_note`, `update_note`, `delete_note` |
| **Tags** | `list_tags`, `create_tag`, `update_tag`, `delete_tag` |
| **Canvas** | `list_canvas_items`, `place_on_canvas`, `move_canvas_item`, `remove_from_canvas` |
| **Discussions** | `list_discussions`, `create_discussion`, `get_discussion_messages` |
| **Reminders** | `list_reminders`, `create_reminder`, `dismiss_reminder` |
| **Notifications** | `list_notifications`, `mark_notification_read` |
| **Links** | `list_links`, `create_link`, `delete_link` |
| **Files** | `list_files`, `get_file`, `upload_file`, `delete_file`, `attach_file_to_task`, `detach_file_from_task` |
| **Memories** | `list_memories`, `get_memory`, `create_memory`, `update_memory`, `delete_memory`, `list_workspace_memories` |

## Task keys

Every task has a human-readable `key` such as `PR14` — the project's `key` prefix plus a per-project number that is assigned at creation and never reused. Task objects return `key` and `number`; project objects return `key`. Anywhere a tool takes a `task_uuid` (get/update/delete/toggle, timers, attachments, `parent_uuid`, `list_tasks` `parent`, `upload_file` `task_uuid`) you can pass the key instead, case-insensitively (`pr14`, `PR-14`). `list_tasks` `q` and `search_project` match keys too. `create_project` accepts an optional `key` (1–5 letters); otherwise it's derived from the name.

## Uploading files

`upload_file` takes the file body from exactly one of four sources:

| Source | Where it works | Use for |
|--------|----------------|---------|
| `path` | Local stdio server only (Claude Code, Claude Desktop launching `dist/index.js`) | Anything on your disk, up to the 50 MB server limit — the bytes go straight from the MCP process to ProjectHub, never through the model |
| `url` | Everywhere, including the hosted connector | Files reachable over https. Private/loopback addresses are refused, redirects are re-checked, 30 s timeout |
| `content` | Everywhere | Small text the assistant generates (reports, CSV, Markdown) |
| `content_base64` | Everywhere | Small binary the assistant generates |

Inline `content` / `content_base64` travel inside the tool call, so they are practically limited to tens of KB. The hosted connector cannot read your disk; for local files there, use the ProjectHub UI or a `url`.

`filename` is required with inline content and defaults to the source's name for `path`/`url`. `task_uuid` attaches the file to a task in the same call. `PROJECTHUB_MAX_UPLOAD_BYTES` overrides the 50 MB client-side cap (the server enforces its own).

## Prerequisites

- Node.js 20+
- A running ProjectHub instance
- A ProjectHub Personal Access Token

### Creating an API Token

1. Log in to ProjectHub
2. Click your avatar (top-right) → **Settings** (gear icon)
3. Scroll to **API Tokens** → click **+**
4. Name the token (e.g. "Claude Desktop MCP") and click **Create**
5. Copy the token immediately — it is only shown once

## Setup

```bash
git clone <repo-url>
cd projecthub-mcp
npm install
npm run build
```

## Configuration

The server reads two environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROJECTHUB_API_TOKEN` | Yes | — | Personal access token (`ph_...`) |
| `PROJECTHUB_URL` | No | `http://localhost:8000` | ProjectHub base URL |

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "projecthub": {
      "command": "node",
      "args": ["/absolute/path/to/projecthub-mcp/dist/index.js"],
      "env": {
        "PROJECTHUB_URL": "http://localhost:8000",
        "PROJECTHUB_API_TOKEN": "ph_your_token_here"
      }
    }
  }
}
```

### Claude Code

Add to your Claude Code settings or project config:

```json
{
  "mcpServers": {
    "projecthub": {
      "command": "node",
      "args": ["/absolute/path/to/projecthub-mcp/dist/index.js"],
      "env": {
        "PROJECTHUB_URL": "http://localhost:8000",
        "PROJECTHUB_API_TOKEN": "ph_your_token_here"
      }
    }
  }
}
```

## Hosted mode — Claude Desktop / claude.ai custom connector

The stdio setup above runs one local process per machine with a pasted token.
For a **custom connector** (Claude Desktop → Settings → Connectors → Add custom
connector, also usable from claude.ai web and mobile) the server must be hosted
over HTTPS and use OAuth. That is what `dist/http.js` is:

- **Transport:** Streamable HTTP at `/mcp`, stateless (scales horizontally).
- **Auth:** ProjectHub itself is the OAuth 2.1 authorization server (PKCE,
  dynamic client registration, consent page). This service is only a resource
  server: it 401s with a `WWW-Authenticate` challenge pointing at its
  `/.well-known/oauth-protected-resource` document, which names ProjectHub as
  the authorization server. Claude follows that, the user approves on
  ProjectHub's consent page, and every subsequent tool call forwards that
  user's access token to `/api/v1`. Personal tokens (`ph_…`) are accepted too.
- **Verification:** each presented token is checked against `GET /api/v1/me`
  and cached for `MCP_VERIFY_TTL_SECONDS` (default 60).

### ProjectHub prerequisites

The ProjectHub deployment must be on a build that includes the OAuth provider
(`oauth2_provider` in `INSTALLED_APPS`, `/oauth/*` routes) with these set:

| Variable | Example | Purpose |
|----------|---------|---------|
| `APP_BASE_URL` | `https://projecthub.example.com` | Advertised as the OAuth issuer; every OAuth endpoint URL in the metadata is anchored to it (must be `https://`) |
| `MCP_PUBLIC_URL` | `https://projecthub-mcp.up.railway.app/mcp` | RFC 9728 resource identifier |

ProjectHub must also run with `DEBUG` off in production. Without `APP_BASE_URL`, the metadata URLs are derived from the request scheme, and a misread proxy header makes them `http://`, which Claude refuses at the registration step.

### Environment (this service)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PROJECTHUB_URL` | Yes | `http://localhost:8000` | Public ProjectHub base URL (also the OAuth issuer) |
| `MCP_PUBLIC_URL` | Recommended | derived from request | This service's public `/mcp` URL |
| `PORT` | No | `3000` | Listen port (Railway sets it) |
| `MCP_ALLOWED_HOSTS` | No | unset | Comma-separated Host allowlist (DNS-rebinding protection); unset = off |
| `MCP_VERIFY_TTL_SECONDS` | No | `60` | How long a verified token is trusted before re-checking |

`PROJECTHUB_API_TOKEN` is **not** used in hosted mode.

### Deploy on Railway

Add a new service in the ProjectHub Railway project from this repo. The
`Dockerfile` builds and runs `node dist/http.js`. Generate a public domain for
the service, then set `MCP_PUBLIC_URL=https://<that domain>/mcp` here and
`MCP_PUBLIC_URL` / `APP_BASE_URL` on the ProjectHub web service.
Health check: `GET /healthz`.

### Connect from Claude

Claude Desktop → Settings → Connectors → **Add custom connector** → URL
`https://<mcp domain>/mcp`. Leave client ID / secret blank (Claude registers
itself). Sign in to ProjectHub when prompted and click **Allow**.

### Run hosted mode locally

```bash
npm run build
PROJECTHUB_URL=http://localhost:8000 npm run start:http
# Inspector: URL http://localhost:3000/mcp, header Authorization: Bearer ph_...
```

Note that ProjectHub only allows `https` redirect URIs, so the full OAuth
browser flow needs a public HTTPS deployment; locally, test with a personal
token as above.

### Tests

```bash
npm test   # builds, then runs an end-to-end test against a mock ProjectHub
```

## Development

```bash
# Watch mode — recompiles on file changes
npm run dev

# Test interactively with the MCP Inspector
npm run inspect
```

## Project Structure

```
src/
  index.ts           stdio entrypoint (local Claude Desktop config, one token per process)
  http.ts            Hosted entrypoint — Streamable HTTP + OAuth resource-server gate
  server.ts          createServer(): builds the McpServer with every tool registered
  api-client.ts      HTTP client (per-request token context), error handling, response helpers
  test/              node:test end-to-end tests for the hosted entrypoint
  tools/
    user.ts          get_user_info
    workspaces.ts    list_workspaces, list_projects
    projects.ts      get_project, list_project_members, search_project, get_activity
    tasks.ts         list_tasks, get_task, create_task, update_task, delete_task, toggle_task
    timers.ts        start_timer, stop_timer
    notes.ts         list_notes, get_note, create_note, update_note, delete_note
    discussions.ts   list_discussions, get_discussion_messages
    reminders.ts     list_reminders, create_reminder, dismiss_reminder
```

## Common Workflows

**Task triage** — List open tasks, review priorities, update or complete them:
> "Show me all open high-priority tasks in the Website Redesign project"

**Standup summary** — Combine your assigned tasks with recent activity:
> "Give me a standup summary for my project"

**Find context** — Search across notes, discussions, and messages:
> "Search for anything about the auth bug in this project"

**Quick capture** — Create tasks, notes, or reminders from conversation:
> "Create a task to review the API documentation, due next Friday"

**Project overview** — Get project details, members, tasks, and notes at a glance:
> "Give me an overview of what's happening in this project"

## Notes

- **Auth**: The API token inherits the user's full permissions — no separate scopes
- **Discussions**: Read-only via the API (messages are sent through the ProjectHub UI)
- **HTML content**: Note and message text is returned as HTML
- **IDs**: All resource IDs are UUIDs except `user_id` and `assignee_id` (integers)
