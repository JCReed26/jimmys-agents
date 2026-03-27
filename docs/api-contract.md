# API Gateway Contract

The gateway at `http://localhost:8080` is the single entry point for all frontend-to-agent communication. All endpoints are documented here with exact request/response shapes.

**Base URL:** `http://localhost:8080`

---

## Health

### `GET /ok`

Health check. Always public (no auth). Used by the frontend to detect if the gateway is up.

**Response:**
```json
{"ok": true}
```

---

## Navigation

### `GET /nav-counts`

Sidebar badge counts. Called on every page load and on interval.

**Response:**
```json
{
  "hitl": 3,
  "hotlUnread": 7
}
```

---

## Registry

### `GET /agents`

All registered agents with live status, circuit breaker state, schedule summaries, and pending HITL count. Health check per agent via `GET {agent_url}/assistants`.

**Response:**
```json
{
  "budget-agent": {
    "status": "RUNNING",
    "enabled": true,
    "port": 8003,
    "circuit": "CLOSED",
    "hitlCount": 2,
    "schedules": [
      {
        "workflow": "weekly-review",
        "cron": "0 9 * * 1",
        "enabled": true,
        "lastRun": "2026-03-24T09:00:00Z",
        "nextRun": "2026-03-31T09:00:00Z"
      }
    ]
  }
}
```

`status` values: `RUNNING` | `DOWN` | `DISABLED`
`circuit` values: `CLOSED` (healthy) | `OPEN` (failing, fast-fail on all requests) | `HALF_OPEN` (one probe allowed)

### `POST /registry/reload`

Hot-reload `agents.yaml` without restarting the gateway. Also resyncs APScheduler with the current DB schedules.

**Response:**
```json
{"ok": true, "agents": ["gmail-agent", "calendar-agent", "budget-agent"]}
```

---

## AG-UI Run Stream

### `POST /agents/{name}/run`

**The core endpoint.** AG-UI compliant run — accepts chat input, returns AG-UI SSE stream.

**Request:**
```
Content-Type: application/json
Accept: text/event-stream
```
```json
{
  "thread_id": "thread-abc123",
  "messages": [
    {"role": "user", "content": "What's my budget this month?"}
  ]
}
```

**Response:** `text/event-stream` — AG-UI events. See `docs/ag-ui-contract.md` for full event reference.

```
data: {"type":"RUN_STARTED","runId":"run-xyz","threadId":"thread-abc123"}
data: {"type":"TEXT_MESSAGE_START","messageId":"msg-001","role":"assistant"}
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":"Your "}
...
data: {"type":"RUN_FINISHED","runId":"run-xyz"}
```

**Error responses (before streaming):**

| Code | Body | Condition |
|---|---|---|
| 404 | `Agent '{name}' not registered.` | Not in agents.yaml |
| 404 | `Agent '{name}' is disabled.` | enabled: false |
| 429 | `Rate limit exceeded...` | Sliding window exceeded |
| 503 | `Circuit breaker OPEN...` | 3+ consecutive failures |

**Error during stream:** `RUN_ERROR` event emitted, stream closes.

**Side effects on completion:**
- `run_records` row closed (status: done, token_count, cost_usd)
- `hotl_logs` row written (tools, overview, duration)

---

## Agent Files

### `GET /agents/{name}/memory`

Reads the agent's persistent memory file (`skills/AGENTS.md`, falls back to `MEMORY.md`).

**Response:**
```json
{"content": "# Agent Memory\n\nUpdated during each run..."}
```

### `GET /agents/{name}/rules`

Reads the agent's rules file (`RULES.md` in agent dir).

**Response:**
```json
{"content": "# Rules\n\n- Always lock Sheet A1 before writing..."}
```

---

## HITL — Human-in-the-Loop

### `GET /hitl`

List HITL items with optional filters.

**Query params:** `status` (pending|approved|rejected), `agent` (name)

**Response:**
```json
[
  {
    "id": 1,
    "agent": "budget-agent",
    "item_type": "receipt_entry",
    "payload": {"amount": 42.50, "vendor": "Publix"},
    "status": "pending",
    "decision": null,
    "comment": null,
    "created_at": "2026-03-27T14:30:00Z"
  }
]
```

### `POST /hitl`

Agent creates a pending item requiring human decision.

**Request:**
```json
{
  "agent": "budget-agent",
  "item_type": "receipt_entry",
  "payload": {"amount": 42.50, "vendor": "Publix"}
}
```

**Response:** `{"id": 1}`

### `GET /hitl/{id}`

Fetch a single HITL item. Agents poll this to detect resolution.

**Response:** Same shape as single item in `GET /hitl`.

**Error:** 404 if not found.

### `POST /hitl/{id}/resolve`

Human resolves a pending item.

**Request:**
```json
{
  "decision": "approved",
  "comment": "Looks right"
}
```

`decision` values: `approved` | `rejected`

**Response:** `{"ok": true}`

**Error:** 404 if not found or already resolved.

---

## HOTL — Human-on-the-Loop

### `GET /hotl`

List run summary logs.

**Query params:** `agent` (name), `unread_only` (bool)

**Response:**
```json
[
  {
    "id": 1,
    "agent": "budget-agent",
    "run_id": "run-xyz789",
    "summary": {
      "overview": "Processed 3 receipts, updated Groceries category.",
      "tools": [
        {"name": "write_file", "args": {"path": "data/Expenses.csv"}, "result": "ok"}
      ],
      "usage": {"input_tokens": 1234, "output_tokens": 456, "cost_usd": 0.0018}
    },
    "read": false,
    "created_at": "2026-03-27T14:35:00Z"
  }
]
```

### `POST /hotl`

**Internal only — used by gateway, not agents.** Writes a run summary.

**Request:**
```json
{
  "agent": "budget-agent",
  "run_id": "run-xyz789",
  "summary": {
    "overview": "string",
    "tools": [{"name": "string", "args": {}, "result": "any"}],
    "usage": {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
  }
}
```

**Response:** `{"id": 1}`

### `POST /hotl/{id}/read`

Mark a single log as read.

**Response:** `{"ok": true}`

### `POST /hotl/read-all`

Mark all logs as read.

**Query params:** `agent` (optional — filter to one agent)

**Response:** `{"ok": true}`

### `POST /hotl/clear`

Permanently delete all HOTL logs. Destructive — requires confirmation in UI.

**Query params:** `agent` (optional — delete only one agent's logs)

**Response:** `{"ok": true, "deleted": 42}`

---

## Run Records

### `GET /runs`

List run records.

**Query params:** `agent` (name), `limit` (default 50)

**Response:**
```json
[
  {
    "run_id": "run-xyz789",
    "agent": "budget-agent",
    "status": "done",
    "token_count": 1690,
    "cost_usd": 0.0018,
    "thread_id": "thread-abc123",
    "started_at": "2026-03-27T14:30:00Z",
    "finished_at": "2026-03-27T14:35:00Z",
    "error_msg": null
  }
]
```

`status` values: `running` | `done` | `error`

### `POST /runs/start`

Manually open a run record. Normally called by the gateway internally — agents do not call this.

**Query params:** `agent`, `run_id`

**Response:** `{"ok": true}`

### `POST /runs/{run_id}/finish`

Close a run record. Normally called by gateway internally.

**Request:**
```json
{
  "status": "done",
  "token_count": 1690,
  "cost_usd": 0.0018,
  "error_msg": null
}
```

**Response:** `{"ok": true}`

---

## Schedules

### `GET /schedules`

All schedules across all agents.

**Response:**
```json
[
  {
    "agent": "budget-agent",
    "workflow": "weekly-review",
    "cron_expr": "0 9 * * 1",
    "enabled": true,
    "task_prompt": "Run the weekly budget review and flag any overspending.",
    "thread_id": "thread-schedule-budget-weekly-review",
    "last_run": "2026-03-24T09:00:00Z",
    "next_run": "2026-03-31T09:00:00Z"
  }
]
```

### `POST /schedules`

Create or update a schedule. Immediately syncs with APScheduler.

**Request:**
```json
{
  "agent": "budget-agent",
  "workflow": "weekly-review",
  "cron_expr": "0 9 * * 1",
  "enabled": true,
  "task_prompt": "Run the weekly budget review and flag any overspending."
}
```

`cron_expr`: standard 5-field cron (`minute hour day month weekday`).

`workflow`: a named identifier for this task on this agent. Multiple workflows per agent are supported.

**Response:** `{"ok": true}`

### `POST /schedules/{agent}/trigger`

Manually fire a workflow immediately (outside its schedule).

**Query params:** `workflow` (default: "default")

**Response:** `{"ok": true, "message": "Triggered budget-agent/weekly-review"}`

---

## Live Stream

### `GET /sse/{agent}/live`

SSE endpoint. Subscribe to receive AG-UI events from the currently-running background (scheduled) task for an agent. If no task is running, the connection stays open and receives events when one starts.

**Response:** `text/event-stream` — same AG-UI event format as `/agents/{name}/run`.

Used by the workflow live-stream panel in the dashboard.

---

## Chat History

### `GET /chat/{agent}/history`

Retrieve message history for a specific thread. Proxies to `GET {agent_url}/threads/{thread_id}/state`.

**Query params:** `thread_id` (required)

**Response:**
```json
{
  "messages": [
    {"role": "human", "content": "What's my budget?"},
    {"role": "assistant", "content": "Your budget this month..."}
  ]
}
```

Returns `{"messages": []}` if thread not found or agent is down.

---

## Stats

### `GET /stats`

Token counts, cost, and run totals per agent.

**Response:**
```json
{
  "by_agent": {
    "budget-agent": {
      "total_runs": 42,
      "errors": 2,
      "total_tokens": 125000,
      "total_cost": 0.18
    }
  },
  "total_runs": 87
}
```

---

## Search

### `GET /search`

Full-text search across HOTL logs, HITL items, and agent memory files.

**Query params:** `q` (min 2 chars)

**Response:**
```json
{
  "results": [
    {
      "type": "hotl",
      "agent": "budget-agent",
      "id": 12,
      "excerpt": "...updated Groceries category after receipt...",
      "created_at": "2026-03-27T14:35:00Z"
    },
    {
      "type": "memory",
      "agent": "budget-agent",
      "id": "AGENTS.md",
      "excerpt": "...Groceries budget set to $400/month...",
      "created_at": null
    }
  ]
}
```

`type` values: `hotl` | `hitl` | `memory` | `rules`

---

## Rate Limiting

Per-agent sliding-window rate limiting. Configured in `agents.yaml`:

```yaml
  budget-agent:
    rate_limit: "10/minute"
```

Format: `"{count}/{unit}"` — unit: `second` | `minute` | `hour`

On limit exceeded: `429 Too Many Requests` with `Retry-After: {window_secs}` header.

---

## Circuit Breaker

Per-agent circuit breaker. Prevents hammering a failing agent.

| State | Behavior |
|---|---|
| CLOSED | Normal — all requests pass through |
| OPEN | Fast-fail — all requests return 503 immediately for 60s |
| HALF_OPEN | One probe allowed — if it succeeds, resets to CLOSED |

Transitions: 3 consecutive failures → OPEN. Successful request during HALF_OPEN → CLOSED.

---

## CORS

Allowed origins: `http://localhost:3000` (frontend), `http://localhost:8080` (self).

All methods and headers are allowed within these origins.
