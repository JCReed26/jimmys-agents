# jimmys-agents — System Overview

A personal AI agent management platform. One place to register, schedule, monitor, and review every AI agent James runs. James builds agents. The harness handles everything else.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dashboard  :3000                           │
│  Chat │ Inbox │ Logs │ Schedules │ Stats │ Observe │ Settings   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ all traffic (AG-UI protocol)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Gateway  :8080                              │
│  agents.yaml registry  │  circuit breaker  │  rate limiting     │
│  run lifecycle (open → translate → close)                       │
│  APScheduler  │  HITL DB  │  HOTL DB  │  SQLite state.db       │
│  LangGraph SSE ──► AG-UI translation ──► browser               │
└─────┬──────────┬──────────┬──────────┬──────────┬──────────────┘
      │          │          │          │          │
   :8001      :8002      :8003      :8004      :8005
  gmail-    calendar-  budget-   job-app-   job-search-
  agent      agent     deepagent  chain      agent
  (LangGraph dev — /runs/stream, /runs, /assistants)
```

**Layer 1 — Agents**: Pure LangGraph processes. Agents speak the LangGraph HTTP API. They don't know about the gateway or AG-UI. The harness handles everything.

**Layer 2 — Gateway**: The brain. Routes all traffic. Translates LangGraph SSE → AG-UI. Owns the full run lifecycle. Manages HITL/HOTL state. Runs the scheduler.

**Layer 3 — Dashboard**: Next.js 16 app that consumes AG-UI events from the gateway. Shows agent status, run history, HITL inbox, cost tracking, schedule management.

---

## Run Lifecycle

### Chat Run

```
1. User types in dashboard chat panel
2. POST /api/chat/{agent} (Next.js proxy)
3. POST /agents/{name}/run (gateway) — opens run_record
4. Gateway calls POST {agent_url}/runs/stream (LangGraph)
   with stream_mode=["messages"] and thread_id from localStorage
5. LangGraph streams native SSE events
6. Gateway translates → AG-UI events → streams to browser
7. Browser receives TEXT_MESSAGE_CONTENT chunks, TOOL_CALL_* events
8. Stream ends → gateway extracts usage_metadata
9. Gateway closes run_record (status: done, tokens, cost)
10. Gateway writes HOTL entry (tools used, overview, duration)
```

### Scheduled Run

```
1. APScheduler fires at cron time
2. trigger_agent_run(agent, workflow, task_prompt)
3. Gateway opens run_record
4. POST {agent_url}/runs/stream (LangGraph) with stored thread_id
5. Gateway streams into in-memory pub-sub queue (per agent)
6. Any browser connected to GET /sse/{agent}/live receives events
7. Stream ends → gateway closes run_record → writes HOTL
```

### Manual Trigger

```
1. User clicks "Run now" in Schedules page
2. POST /schedules/{agent}/trigger
3. Same path as scheduled run (step 3 onward above)
```

---

## HITL — Human-in-the-Loop

Agents pause and wait for a human decision before continuing.

```
Agent encounters ambiguous action
  → POST localhost:8080/hitl {"agent": "budget-agent", "item_type": "...", "payload": {...}}
  → Agent polls GET /hitl/{id} every 5s
  → Dashboard sidebar shows badge (pending count)
  → Inbox page shows the item with Approve / Reject buttons
  → User resolves: POST /hitl/{id}/resolve {"decision": "approved"}
  → Agent's next poll returns the decision
  → Agent continues execution
```

HITL is the **only** gateway callback agents make. Everything else (run lifecycle, HOTL) is owned by the gateway.

---

## HOTL — Human-on-the-Loop

Post-run review logs. James can see what each agent did after the fact.

```
Any run completes (chat or scheduled)
  → Gateway extracts from the AG-UI stream it translated:
      - Tool calls (name, args, result)
      - usage_metadata (input_tokens, output_tokens)
      - Duration (started_at → finished_at)
  → Writes HOTL entry: {agent, run_id, summary: {tools, overview, thoughts}}
  → Logs page shows entry with unread badge
  → Global search indexes HOTL content
```

HOTL is **gateway-owned**. Agents do not call `/hotl`. The gateway builds the summary from the translated stream.

---

## Agent Registry

`agents.yaml` at project root is the single source of truth.

```yaml
agents:
  budget-agent:
    port: 8003
    dir: agents/budget-deepagent   # relative to project root
    enabled: true
    rate_limit: "10/minute"
```

### Adding an agent

1. Create `agents/{name}/` with `agent.py` + `langgraph.json` + `skills/`
2. Start the process: `langgraph dev --port {port}` (or via Makefile)
3. Add entry to `agents.yaml`
4. `POST /registry/reload`

The agent immediately appears in the dashboard with live status. No code changes, no restart.

### Removing an agent

1. Stop the process
2. Delete (or comment) the entry in `agents.yaml`
3. `POST /registry/reload`

Run history, HITL items, and HOTL logs for that agent remain in the DB.

### Enabling/disabling

```yaml
  budget-agent:
    enabled: false
```

`POST /registry/reload` → APScheduler jobs paused, `/run` returns 404, agent appears as DISABLED in dashboard.

---

## Scheduling

Each agent can have multiple named workflows with their own cron and prompt.

```
budget-agent
  ├── weekly-review   (0 9 * * 1)  "Run the weekly budget review and flag overspending"
  └── daily-sync      (0 7 * * *)   "Sync latest receipts from Gmail"
```

Schedules are stored in `data/state.db`. APScheduler reads from the DB on startup and on every `POST /registry/reload` or schedule upsert. Disabling a schedule removes the APScheduler job immediately.

Thread IDs for scheduled runs are stored per schedule so run history is reviewable and continuous across executions.

---

## Ports

| Service | Port |
|---|---|
| Next.js frontend | 3000 |
| FastAPI gateway | 8080 |
| gmail-agent | 8001 |
| calendar-agent | 8002 |
| budget-deepagent | 8003 |
| job-app-chain | 8004 |
| job-search-agent | 8005 |

---

## Data

All state lives in `data/state.db` (SQLite, WAL mode). Tables:

| Table | Contents |
|---|---|
| `run_records` | Every run — agent, run_id, status, tokens, cost, started_at, finished_at |
| `hitl_items` | Pending/resolved approval requests |
| `hotl_logs` | Post-run summaries (tools, thoughts, overview) |
| `schedules_v2` | Cron configs per agent+workflow, thread_id |

---

## Deepagent Pattern

Budget-agent is the reference implementation. Deepagents are LangGraph agents with:

- **Skills**: SKILL.md files in `skills/` — loaded on demand by the agent to reduce token usage
- **Memory**: `skills/AGENTS.md` — the agent's persistent notebook, written across runs
- **FilesystemBackend**: gives the agent real file tools (`read_file`, `write_file`, `edit_file`) scoped to its own directory
- **Middleware**: `abefore_agent` / `aafter_agent` hooks for pre/post-run domain logic

The gateway reads `skills/AGENTS.md` for the Memory tab in the dashboard. The agent writes it freely.

File operations (write_file, read_file, etc.) are LangGraph tool calls. The gateway's AG-UI translation surfaces them as `TOOL_CALL_*` events — every file the agent touches is visible in the run stream and HOTL.

---

## Framework Agnosticism

The gateway speaks LangGraph HTTP API on the agent side. Any agent that exposes:

- `POST /runs/stream` (streaming)
- `POST /runs` (blocking)
- `GET /assistants` (health check)

...works with the harness — deepagents, vanilla LangGraph, CrewAI with a LangGraph adapter, or any other framework that implements the LangGraph HTTP spec.

For native AG-UI agents (those that emit AG-UI directly), the gateway can pass through without translation.

---

## Security (deferred)

Current state: local-only, no auth, CORS locked to `localhost:3000`. Acceptable for solo dev.

When adding remote access (post-Neon migration):
- API key header auth (`X-API-Key`) on all non-health endpoints
- Neon Auth OTP passwordless for dashboard login
- Neon Postgres replacing SQLite for durability

See `docs/issues.md` I-03 for the full security task list.
