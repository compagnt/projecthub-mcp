# ProjectHub MCP Server

An MCP (Model Context Protocol) server that connects AI assistants like Claude Desktop to [ProjectHub](https://github.com/your-org/projecthub), a collaborative project management tool.

## Features

25 tools covering the full ProjectHub API:

| Category | Tools |
|----------|-------|
| **User** | `get_user_info` |
| **Workspaces** | `list_workspaces`, `list_projects` |
| **Projects** | `get_project`, `list_project_members`, `search_project`, `get_activity` |
| **Tasks** | `list_tasks`, `get_task`, `create_task`, `update_task`, `delete_task`, `toggle_task` |
| **Time Tracking** | `start_timer`, `stop_timer` |
| **Notes** | `list_notes`, `get_note`, `create_note`, `update_note`, `delete_note` |
| **Discussions** | `list_discussions`, `get_discussion_messages` |
| **Reminders** | `list_reminders`, `create_reminder`, `dismiss_reminder` |

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
  index.ts           Entry point — creates server and connects stdio transport
  api-client.ts      HTTP client with auth, error handling, and response helpers
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
