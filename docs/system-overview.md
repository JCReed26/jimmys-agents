# jimmys-agents — System Overview

A personal AI agent management platform. One place to register, schedule, monitor, and review every AI agent James runs. James builds agents. The harness handles everything else.

---

## Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Dashboard  :3000                           │
│  Chat │ Inbox │ Logs │ Schedules │ Stats │ Observe │ Settings   │
│  Admin (superadmin only) │ Agent Memory editor                  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ all traffic (AG-UI protocol)
                           │ JWT Bearer — Supabase Auth
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Gateway  :8080                              │
│  agents.yaml registry  │  circuit breaker  │  rate limiting     │
│  run lifecycle (open → translate → close)                       │
│  APScheduler  │  HITL DB  │  HOTL DB  │  asyncpg Postgres      │
│  LangGraph SSE ──► AG-UI translation ──► browser               │
│  Multi-tenant (tenant_id on every row)                          │
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

## Auth & Multi-Tenancy

Auth is **Supabase OTP passwordless** (email magic link). All gateway endpoints require a JWT Bearer token issued by Supabase.

```
Browser → POST /api/auth (Next.js route) → Supabase OTP
Browser stores session → subsequent requests: Authorization: Bearer {jwt}
Next.js server routes call getServerAccessToken() → forward Bearer to gateway
Gateway auth_middleware.py verifies JWT → sets request.state.tenant_id
Every DB query is scoped by tenant_id
```

**Internal API key bypass**: Agents that need to call `/hotl` without a JWT pass `X-Internal-Key: {INTERNAL_API_KEY}`. The middleware grants `tenant_id = "internal"` and the endpoint resolves the real tenant from `tenant_agents`.

**Admin access**: The `/admin/*` endpoints require `tenant_id == JAMES_TENANT_ID` (hardcoded in `api_server.py`). The Admin dashboard page is accessible only to the superadmin tenant.

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
6. Gateway StreamTranslator translates → AG-UI events → streams to browser
7. Browser receives TEXT_MESSAGE_CONTENT chunks, TOOL_CALL_* events
8. Stream ends → translator extracts usage_metadata (cost, tokens)
9. Gateway closes run_record (status: done, tokens, cost)
10. Gateway writes HOTL entry (tools used, overview, duration, cost)
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
  → Gateway StreamTranslator extracts from the AG-UI stream:
      - Tool calls (name, args, result)
      - usage_metadata (input_tokens, output_tokens)
      - Duration (started_at → finished_at)
      - LangSmith run ID (if LANGSMITH_TRACING=true)
  → Writes HOTL entry: {agent, run_id, cost_usd, total_tokens, summary}
  → Logs page shows entry with unread badge + LangSmith trace link
  → Global search indexes HOTL content
```

HOTL is **gateway-owned**. Agents do not call `/hotl`. The gateway builds the summary from the translated stream.

---

## Agent Registry

`agents.yaml` at project root is the single source of truth for running processes.

```yaml
agents:
  budget-agent:
    port: 8003
    dir: agents/budget-deepagent   # relative to project root
    enabled: true
    rate_limit: "10/minute"
```

### Adding an agent (4 steps)

1. Copy `agents/_template/` → `agents/{name}/`, edit `agent.py`
2. Add entry to `agents.yaml` (copy existing format)
3. Add entry to `frontend/src/lib/agents.ts` (copy existing pattern)
4. Add `run-{name}` target to `Makefile` (copy existing target)

Then `POST /registry/reload` to hot-load without restart.

### Removing an agent

1. Stop the process
2. Delete (or comment) the entry in `agents.yaml`
3. `POST /registry/reload`

Run history, HITL items, and HOTL logs for that agent remain in the DB.

---

## Scheduling

Each agent can have multiple named workflows with their own cron and prompt.

```
budget-agent
  ├── weekly-review   (0 9 * * 1)  "Run the weekly budget review and flag overspending"
  └── daily-sync      (0 7 * * *)   "Sync latest receipts from Gmail"
```

Schedules are stored in Postgres (`schedules` table). APScheduler reads from the DB on startup and on every `POST /registry/reload` or schedule upsert. Disabling a schedule removes the APScheduler job immediately.

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

All state lives in **Supabase Postgres** via `asyncpg` connection pool. All SQL is in `backend/sql/` as named query files, loaded by `backend/sql_loader.py`.

| Table | Contents |
|---|---|
| `tenants` | Tenant records (id, name, is_active) |
| `user_tenants` | Maps Supabase auth user IDs → tenants |
| `agent_registry` | Agent definitions (name, port, display_name, accent_color) |
| `tenant_agents` | Which agents are assigned to which tenant |
| `tenant_agent_configs` | Per-tenant agent config overrides (JSONB) |
| `run_records` | Every run — agent, run_id, status, tokens, cost, started_at, finished_at |
| `hitl_items` | Pending/resolved approval requests |
| `hotl_logs` | Post-run summaries (tools, thoughts, overview, cost_usd, total_tokens) |
| `schedules` | Cron configs per (tenant_id, agent, workflow), thread_id |

SQL files in `backend/sql/`:
- `nav.sql` — badge counts
- `hitl.sql` — HITL inbox queries
- `hotl.sql` — HOTL log queries
- `runs.sql` — run record lifecycle
- `schedules.sql` — schedule CRUD + APScheduler load
- `agents.sql` — agent status, memory/rules search
- `admin.sql` — tenant/user/agent admin operations

---

## Agent Memory (AGENTS.md)

Each deepagent has a persistent memory file at `{agent.dir}/skills/AGENTS.md`. This is:
- Written by the agent during runs (its notebook / preferences)
- Readable and editable from the dashboard Memory tab
- Read via `GET /agents/{name}/agents-md` → reads the actual file from disk
- Written via `PUT /agents/{name}/agents-md` → writes back to disk

The agent reads this file at startup as part of its `memory=["skills/AGENTS.md"]` config.

---

## Deepagent Pattern

Budget-agent is the reference implementation. Deepagents are LangGraph agents with:

- **Skills**: SKILL.md files in `skills/` — loaded on demand by the agent to reduce token usage
- **Memory**: `skills/AGENTS.md` — the agent's persistent notebook, written across runs
- **FilesystemBackend**: gives the agent real file tools (`read_file`, `write_file`, `edit_file`) scoped to its own directory
- **Middleware**: `abefore_agent` / `aafter_agent` hooks for pre/post-run domain logic

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

## Security

Auth is enforced at the gateway via JWT verification (`auth_middleware.py`). Every endpoint is tenant-scoped. Internal agents bypass JWT with `X-Internal-Key` header. Admin endpoints gate on `JAMES_TENANT_ID`.

CORS is locked to `CORS_ORIGINS` env var (comma-separated). Default: `http://localhost:3000`.

See `docs/dev-notes/auth-flow.md` for the full auth decision tree.
