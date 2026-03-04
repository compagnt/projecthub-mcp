# ProjectHub MCP Server — Implementation Guide

This document provides everything needed to build an MCP (Model Context Protocol) server that integrates with ProjectHub's REST API. Use this as a reference when building the server in a separate repository.

## Overview

ProjectHub is a collaborative project management tool. The MCP server will allow AI assistants (Claude Desktop, etc.) to interact with ProjectHub projects — managing tasks, reading notes and discussions, creating reminders, and searching content.

**Transport:** stdio (for Claude Desktop integration)
**Auth:** Bearer token via ProjectHub's Personal Access Token system

---

## Authentication

ProjectHub has a built-in **Personal Access Token** system specifically designed for API access. Tokens are generated from the UI and used as Bearer tokens in API requests.

### Token Format
```
ph_<40-hex-characters>
```

Tokens are stored as SHA-256 hashes in the database — the plain token is shown **only once** at creation time. The token prefix (`ph_abc1...`) is stored for identification in the token list.

### How to Create a Token
1. Log in to ProjectHub
2. Click the avatar in the top-right → **Settings** (gear icon)
3. Scroll to the **"API Tokens"** section at the bottom of the settings modal
4. Click the **+** button, enter a name (e.g., "Claude Desktop MCP"), click **Create**
5. **Copy the token immediately** — it cannot be retrieved later
6. The token list shows all tokens with prefix, creation date, and last used timestamp
7. Tokens can be revoked at any time from the same UI

### How to Use
All API requests require the `Authorization` header:
```
Authorization: Bearer ph_abc123def456...
```

The token inherits the user's full permissions — no separate scopes. Whatever the user can do in the ProjectHub UI, the token can do via the API (within the API's endpoint coverage).

### Token Behavior
- **No expiration** — tokens remain valid until manually revoked
- **`last_used_at`** is updated on each API call (visible in the token list UI)
- **Revoked tokens** immediately return `401`
- **One user can have multiple tokens** (e.g., one for Claude Desktop, one for a script)
- Unauthenticated or invalid token requests return `401`

---

## Base URL

```
http://localhost:8000/api/v1
```

For production, replace with your deployed URL.

---

## API Endpoints — Complete Reference

All responses are JSON. All UUIDs are v4 format.

### User

#### `GET /me`
Returns the authenticated user's info.

**Response:**
```json
{
  "id": 1,
  "username": "johndoe",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com"
}
```

---

### Workspaces

#### `GET /workspaces`
List all workspaces the user belongs to.

**Response:**
```json
[
  {
    "unique_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "My Company",
    "description": ""
  }
]
```

#### `GET /workspaces/{workspace_uuid}/projects`
List projects in a workspace that the user is a member of.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `include_archived` | bool | `false` | Include archived projects |

**Response:**
```json
[
  {
    "unique_id": "...",
    "name": "Website Redesign",
    "description": "",
    "color": "indigo",
    "icon": "fa-rocket",
    "is_archived": false,
    "created_at": "2025-12-01T10:00:00Z"
  }
]
```

---

### Projects

#### `GET /projects/{project_uuid}`
Get project details.

**Response:** Same shape as project object above.

**Errors:** `404` if user is not a member of the project.

#### `GET /projects/{project_uuid}/members`
List project members with their roles.

**Response:**
```json
[
  {
    "user_id": 1,
    "username": "johndoe",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "role": "Project Owner"
  }
]
```

---

### Tasks

#### `GET /projects/{project_uuid}/tasks`
List tasks in a project.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | (all) | Comma-separated filter: `open`, `in_progress`, `done` |
| `assignee` | string | (all) | `me` to filter to current user |
| `parent` | string | `none` | `none` = top-level only, `all` = all tasks, or a task UUID for subtasks of that task |

**Response:**
```json
[
  {
    "unique_id": "...",
    "title": "Design homepage",
    "description": "",
    "status": "open",
    "priority": "high",
    "start_date": "2025-12-01",
    "due_date": "2025-12-15",
    "assignee_name": "John",
    "assignee_id": 1,
    "parent_uuid": null,
    "has_unmet_dependencies": false,
    "created_at": "2025-12-01T10:00:00Z"
  }
]
```

**Status values:** `open`, `in_progress`, `done`
**Priority values:** `low`, `medium`, `high`

#### `POST /projects/{project_uuid}/tasks`
Create a new task. Requires `add_task` permission (Project Owner or Contributor).

**Request body:**
```json
{
  "title": "Design homepage",
  "description": "<p>Some HTML content</p>",
  "status": "open",
  "priority": "medium",
  "start_date": "2025-12-01",
  "due_date": "2025-12-15",
  "assignee_id": 1,
  "parent_uuid": null
}
```

Only `title` is required. All other fields have defaults:
- `description`: `""`
- `status`: `"open"`
- `priority`: `"medium"`
- `start_date`, `due_date`, `assignee_id`, `parent_uuid`: `null`

**Response:** `201` with the created task object.
**Errors:** `403` if no permission.

#### `GET /projects/{project_uuid}/tasks/{task_uuid}`
Get a single task's details.

**Response:** Task object (same shape as list items).

#### `PATCH /projects/{project_uuid}/tasks/{task_uuid}`
Update a task. Only provided fields are changed. Requires `change_task` permission.

**Request body** (all fields optional):
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "status": "in_progress",
  "priority": "high",
  "start_date": "2025-12-01",
  "due_date": "2025-12-20",
  "assignee_id": 2
}
```

Set `assignee_id` to `0` to unassign.

**Response:** `200` with updated task object.
**Errors:** `403` if no permission.

#### `DELETE /projects/{project_uuid}/tasks/{task_uuid}`
Delete a task. Requires `delete_task` permission (Project Owner only).

**Response:** `204` (no body).
**Errors:** `403` if no permission.

#### `POST /projects/{project_uuid}/tasks/{task_uuid}/toggle`
Toggle a task between `open` and `done`.

**Response:** Updated task object.

#### `POST /projects/{project_uuid}/tasks/{task_uuid}/timer/start`
Start a time tracking timer on a task. Automatically stops any other running timer for the user.

**Response:**
```json
{ "status": "started", "task_uuid": "..." }
```
**Errors:** `409` if timer already running on this specific task.

#### `POST /projects/{project_uuid}/tasks/{task_uuid}/timer/stop`
Stop the running timer on a task.

**Response:**
```json
{
  "status": "stopped",
  "duration_seconds": 3600,
  "total_seconds": 7200
}
```
**Errors:** `404` if no running timer on this task.

---

### Notes

Notes contain rich text (HTML) content.

#### `GET /projects/{project_uuid}/notes`
List all notes. Ordered by pinned first, then newest.

**Response:**
```json
[
  {
    "unique_id": "...",
    "title": "Meeting Notes",
    "text": "<p>HTML content here</p>",
    "color": "yellow",
    "is_pinned": false,
    "created_by_name": "John",
    "updated_by_name": "Jane",
    "created_at": "2025-12-01T10:00:00Z",
    "updated_at": "2025-12-02T14:30:00Z"
  }
]
```

**Color values:** `yellow`, `blue`, `green`, `pink`, `purple`

#### `POST /projects/{project_uuid}/notes`
Create a new note.

**Request body:**
```json
{
  "title": "Meeting Notes",
  "text": "<p>Content</p>",
  "color": "yellow"
}
```

Only `title` is required. Defaults: `text` = `""`, `color` = `"yellow"`.

**Response:** `201` with created note object.

#### `GET /projects/{project_uuid}/notes/{note_uuid}`
Get a single note with full content.

#### `PATCH /projects/{project_uuid}/notes/{note_uuid}`
Update a note. Only provided fields are changed.

**Request body** (all fields optional):
```json
{
  "title": "Updated title",
  "text": "<p>Updated content</p>",
  "color": "blue"
}
```

**Response:** `200` with updated note object.

#### `DELETE /projects/{project_uuid}/notes/{note_uuid}`
Delete a note. Requires being the creator or having `delete_note` permission.

**Response:** `204` (no body).
**Errors:** `403` if no permission.

---

### Discussions (Read-Only)

Discussions are chat rooms. Messages are created via WebSocket (not REST API), but can be read via the API.

#### `GET /projects/{project_uuid}/discussions`
List all discussions.

**Response:**
```json
[
  {
    "unique_id": "...",
    "title": "Design Review",
    "created_by_name": "John",
    "message_count": 42,
    "created_at": "2025-12-01T10:00:00Z"
  }
]
```

#### `GET /projects/{project_uuid}/discussions/{discussion_uuid}/messages`
Get messages from a discussion. Returns in chronological order (oldest first).

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | `50` | Max messages (1–200) |
| `before` | string | (none) | ISO datetime for pagination — get messages before this time |

**Response:**
```json
[
  {
    "unique_id": "...",
    "text": "<p>Hello everyone</p>",
    "author_name": "John",
    "created_at": "2025-12-01T10:00:00Z"
  }
]
```

**Note:** Free plans have a 30-day message history limit. Pro plans have unlimited history.

---

### Reminders

#### `GET /projects/{project_uuid}/reminders`
List pending reminders for the current user.

**Response:**
```json
[
  {
    "unique_id": "...",
    "title": "Follow up on design",
    "notes": "",
    "remind_at": "2025-12-15T09:00:00Z",
    "status": "pending",
    "task_uuid": "...",
    "note_uuid": null,
    "created_at": "2025-12-01T10:00:00Z"
  }
]
```

**Status values:** `pending`, `sent`, `dismissed`

#### `POST /projects/{project_uuid}/reminders`
Create a reminder. Schedules a background notification task.

**Request body:**
```json
{
  "title": "Follow up on design",
  "notes": "Check with Jane about mockups",
  "remind_at": "2025-12-15T09:00:00+00:00",
  "task_uuid": null,
  "note_uuid": null,
  "send_email": true,
  "send_in_app": true
}
```

Only `title` and `remind_at` are required. `remind_at` should be timezone-aware ISO 8601.

**Response:** `201` with created reminder object.

#### `DELETE /projects/{project_uuid}/reminders/{reminder_uuid}`
Dismiss a reminder (sets status to `dismissed`).

**Response:** `204` (no body).

---

### Search

#### `GET /projects/{project_uuid}/search`
Search across notes, discussions, and messages.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `q` | string | Search query (minimum 3 characters, max 500) |

Pro plan workspaces use semantic (vector) search. Free plan uses keyword matching.

**Response:**
```json
[
  {
    "type": "note",
    "unique_id": "...",
    "title": "Meeting Notes",
    "snippet": "...discussed the homepage design...",
    "score": 0.85
  },
  {
    "type": "discussion",
    "unique_id": "...",
    "title": "Design Review",
    "snippet": "",
    "score": 0.72
  },
  {
    "type": "message",
    "unique_id": "...",
    "title": "Design Review",
    "snippet": "...what about the header layout...",
    "score": 0.68
  }
]
```

**Result types:** `note`, `discussion`, `message`
**Max results:** 4 per type
**Score:** Only present on Pro plans (semantic search). `null` on Free plans.

---

### Activity

#### `GET /projects/{project_uuid}/activity`
Get recent activity feed for a project.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | `10` | Max entries (1–50) |

**Response:**
```json
[
  {
    "action_type": "created_task",
    "details": "John created task \"Design homepage\"",
    "user_name": "John",
    "created_at": "2025-12-01T10:00:00Z"
  }
]
```

**Common action types:** `created_note`, `deleted_note`, `created_discussion`, `deleted_discussion`, `created_task`, `deleted_task`, `completed_task`, `created_link`, `deleted_link`

---

## Error Responses

All errors follow this format:
```json
{ "detail": "Error message here" }
```

| Status | Meaning |
|--------|---------|
| `401` | Missing or invalid token |
| `403` | Authenticated but insufficient permissions |
| `404` | Resource not found or user is not a project member |
| `409` | Conflict (e.g., timer already running) |

---

## Suggested MCP Tools

Below is a suggested mapping of API endpoints to MCP tools. Group related functionality into tools with clear names.

### Resource Tools (for MCP `resources` or `read` tools)
These provide context to the AI without side effects.

| Tool Name | API Call | Description |
|-----------|----------|-------------|
| `get_user_info` | `GET /me` | Get current user identity |
| `list_workspaces` | `GET /workspaces` | List available workspaces |
| `list_projects` | `GET /workspaces/{uuid}/projects` | List projects in a workspace |
| `get_project` | `GET /projects/{uuid}` | Get project details |
| `list_project_members` | `GET /projects/{uuid}/members` | List project members |
| `list_tasks` | `GET /projects/{uuid}/tasks` | List tasks with optional filters |
| `get_task` | `GET /projects/{uuid}/tasks/{uuid}` | Get single task details |
| `list_notes` | `GET /projects/{uuid}/notes` | List all notes |
| `get_note` | `GET /projects/{uuid}/notes/{uuid}` | Get note with full content |
| `list_discussions` | `GET /projects/{uuid}/discussions` | List discussions |
| `get_discussion_messages` | `GET /projects/{uuid}/discussions/{uuid}/messages` | Read discussion messages |
| `list_reminders` | `GET /projects/{uuid}/reminders` | List pending reminders |
| `search_project` | `GET /projects/{uuid}/search?q=` | Search across project content |
| `get_activity` | `GET /projects/{uuid}/activity` | Recent activity feed |

### Action Tools (for MCP `tools` that modify data)

| Tool Name | API Call | Description |
|-----------|----------|-------------|
| `create_task` | `POST /projects/{uuid}/tasks` | Create a new task |
| `update_task` | `PATCH /projects/{uuid}/tasks/{uuid}` | Update task fields |
| `delete_task` | `DELETE /projects/{uuid}/tasks/{uuid}` | Delete a task |
| `toggle_task` | `POST /projects/{uuid}/tasks/{uuid}/toggle` | Toggle task open/done |
| `start_timer` | `POST /projects/{uuid}/tasks/{uuid}/timer/start` | Start time tracking |
| `stop_timer` | `POST /projects/{uuid}/tasks/{uuid}/timer/stop` | Stop time tracking |
| `create_note` | `POST /projects/{uuid}/notes` | Create a new note |
| `update_note` | `PATCH /projects/{uuid}/notes/{uuid}` | Update a note |
| `delete_note` | `DELETE /projects/{uuid}/notes/{uuid}` | Delete a note |
| `create_reminder` | `POST /projects/{uuid}/reminders` | Create a reminder |
| `dismiss_reminder` | `DELETE /projects/{uuid}/reminders/{uuid}` | Dismiss a reminder |

---

## Configuration

### Setup Flow
1. User creates a Personal Access Token in ProjectHub (User Settings → API Tokens → **+**)
2. User copies the `ph_...` token (shown once)
3. User pastes the token into their MCP server config (see below)
4. MCP server uses the token for all API calls

The MCP server should accept configuration for:

```json
{
  "projecthub_url": "http://localhost:8000",
  "api_token": "ph_abc123..."
}
```

For Claude Desktop, users would configure in `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "projecthub": {
      "command": "node",
      "args": ["path/to/projecthub-mcp/dist/index.js"],
      "env": {
        "PROJECTHUB_URL": "http://localhost:8000",
        "PROJECTHUB_API_TOKEN": "ph_abc123..."
      }
    }
  }
}
```

Or for a Python MCP server:
```json
{
  "mcpServers": {
    "projecthub": {
      "command": "python",
      "args": ["-m", "projecthub_mcp"],
      "env": {
        "PROJECTHUB_URL": "http://localhost:8000",
        "PROJECTHUB_API_TOKEN": "ph_abc123..."
      }
    }
  }
}
```

---

## Common Workflows

These are typical multi-step operations the MCP server should support well:

1. **Task triage**: `list_tasks(status=open)` → review → `update_task(priority=high)` or `toggle_task`
2. **Standup summary**: `list_tasks(assignee=me, status=open,in_progress)` + `get_activity(limit=20)` → summarize
3. **Find context**: `search_project(q="auth bug")` → `get_note(uuid)` or `get_discussion_messages(uuid)`
4. **Quick capture**: User describes something → `create_task` or `create_note` or `create_reminder`
5. **Project overview**: `get_project` + `list_tasks` + `list_discussions` + `list_notes` → summarize state

---

## Permission Matrix

What each project role can do via the API:

| Action | Project Owner | Project Contributor | Project Viewer |
|--------|:---:|:---:|:---:|
| Read tasks/notes/discussions | Yes | Yes | Yes |
| Create tasks | Yes | Yes | No |
| Update tasks | Yes | Yes | No |
| Delete tasks | Yes | No | No |
| Create notes | Yes | Yes | Yes |
| Update notes | Yes | Yes | Yes |
| Delete notes | Creator or Owner | Creator only | Creator only |
| Create reminders | Yes | Yes | Yes |
| Search | Yes | Yes | Yes |

---

## Implementation Notes

- **All IDs are UUIDs** except `user_id` (integer) and `assignee_id` (integer)
- **Note and message text is HTML** (via Trix rich text editor). When displaying to users, strip HTML tags for plain text
- **Dates** are ISO 8601. `start_date` and `due_date` are date-only (`YYYY-MM-DD`). Timestamps include time (`YYYY-MM-DDTHH:MM:SSZ`)
- **`remind_at` must be timezone-aware** — include timezone offset or use UTC (`Z`)
- **Discussions are read-only** via the API. Messages are sent via WebSocket in the main app
- **The token inherits the user's full permissions** — no separate scopes
- **Rate limiting**: None currently. Be respectful with polling frequency
- **Pagination**: Tasks, notes, discussions return full lists. Messages support cursor-based pagination via `before` param
