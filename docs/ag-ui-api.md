# AG-UI API Gateway

Backend: FastAPI at `http://localhost:8080`
Protocol: [AG-UI](https://docs.ag-ui.com/) — POST body in, SSE stream out.

---

## How It Works

Each agent runs as its own LangGraph process on a dedicated port. The gateway at 8080 sits in front of all of them and handles:

- **Routing** — maps agent name → process port via `agents.yaml`
- **Rate limiting** — per-agent sliding window, configured per agent in `agents.yaml`
- **Circuit breaking** — 3 consecutive failures → OPEN for 60s → 503 fast-fail
- **Run logging** — every run (scheduled or chat) is recorded in `data/state.db`
- **HITL / HOTL** — approve/reject inbox and post-hoc review log

The frontend never talks to individual agent ports. It only talks to the gateway.

---

## Agent Registry (`agents.yaml`)

`agents.yaml` at the project root is the single source of truth. The gateway hot-reloads it — **no restart required**.

```yaml
agents:
  budget-agent:
    port: 8003          # LangGraph dev server port
    dir: budget-agent   # subdirectory (for MEMORY.md / RULES.md reads)
    enabled: true       # false = registered but refuses /run requests
    rate_limit: "10/minute"  # per-IP sliding window
```

### Add an agent

1. Start the agent's LangGraph process on its port (e.g. `langgraph dev --port 8005`)
2. Add an entry to `agents.yaml`
3. `POST /registry/reload`

### Remove an agent

1. Delete (or comment out) the entry in `agents.yaml`
2. `POST /registry/reload`

The agent's run history, HITL items, and HOTL logs remain in the DB — only routing is removed.

### Disable without removing

```yaml
  budget-agent:
    enabled: false
```

Then `POST /registry/reload`. The agent still appears in `GET /agents` (status: DISABLED) but `/run` returns 404.

### Reload endpoint

```
POST /registry/reload
```

Response:
```json
{ "ok": true, "agents": ["gmail-agent", "calendar-agent", "budget-agent", "job-app-chain"] }
```

---

## AG-UI Run Endpoint

This is the core endpoint. The frontend uses this for all chat interactions.

```
POST /agents/{name}/run
Content-Type: application/json
Accept: text/event-stream
```

**Request body** — standard AG-UI run input:
```json
{
  "thread_id": "thread-abc123",
  "run_id": "run-xyz789",
  "messages": [
    { "role": "user", "content": "What's my budget looking like this month?" }
  ],
  "state": {},
  "config": {}
}
```

**Response** — SSE stream of AG-UI events:
```
event: RUN_STARTED
data: {"type":"RUN_STARTED","runId":"run-xyz789","threadId":"thread-abc123"}

event: TEXT_MESSAGE_START
data: {"type":"TEXT_MESSAGE_START","messageId":"msg-001","role":"assistant"}

event: TEXT_MESSAGE_CONTENT
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":"Your "}

event: TEXT_MESSAGE_CONTENT
data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":"spending is..."}

event: TEXT_MESSAGE_END
data: {"type":"TEXT_MESSAGE_END","messageId":"msg-001"}

event: RUN_FINISHED
data: {"type":"RUN_FINISHED","runId":"run-xyz789"}
```

**Error responses (before streaming starts):**
| Code | Reason |
|---|---|
| 404 | Agent not registered or disabled |
| 429 | Rate limit exceeded (`Retry-After` header included) |
| 503 | Circuit breaker OPEN — agent has been failing |

**Error during stream** — if the agent process dies mid-stream, a `RUN_ERROR` event is emitted and the stream closes:
```
event: RUN_ERROR
data: {"type":"RUN_ERROR","runId":"run-xyz789","message":"Connection refused"}
```

---

## All Endpoints

### Gateway

| Method | Path | Description |
|---|---|---|
| `GET` | `/ok` | Health check — returns `{"ok": true}` |
| `GET` | `/nav-counts` | Sidebar badge counts: `{"hitl": N, "hotlUnread": N}` |
| `POST` | `/registry/reload` | Hot-reload `agents.yaml` without restart |

### Agents

| Method | Path | Description |
|---|---|---|
| `GET` | `/agents` | All registered agents with live status, circuit state, schedules, HITL count |
| `POST` | `/agents/{name}/run` | **AG-UI run** — streams SSE response |
| `GET` | `/agents/{name}/memory` | Read `{dir}/MEMORY.md` (managed by Deep Agents) |
| `GET` | `/agents/{name}/rules` | Read `{dir}/RULES.md` (managed by Deep Agents) |

`GET /agents` response shape:
```json
{
  "budget-agent": {
    "status": "RUNNING",
    "enabled": true,
    "port": 8003,
    "circuit": "CLOSED",
    "hitlCount": 2,
    "schedules": [
      { "workflow": "weekly-review", "cron": "0 9 * * 1", "enabled": true, "lastRun": "...", "nextRun": "..." }
    ]
  }
}
```

`circuit` values: `CLOSED` (healthy) | `OPEN` (failing, fast-fail) | `HALF_OPEN` (recovery probe allowed)

### HITL (Human-in-the-Loop)

Agents POST pending items here; frontend shows approve/reject UI.

| Method | Path | Description |
|---|---|---|
| `GET` | `/hitl` | List items. Query: `?status=pending&agent=budget-agent` |
| `POST` | `/hitl` | Agent creates a pending item |
| `GET` | `/hitl/{id}` | Single item |
| `POST` | `/hitl/{id}/resolve` | Resolve: `{"decision": "approved", "comment": ""}` |

`POST /hitl` body:
```json
{ "agent": "budget-agent", "item_type": "receipt_entry", "payload": { ... } }
```

### HOTL (Human-on-the-Loop)

Post-hoc review logs — agents write summaries after each run.

| Method | Path | Description |
|---|---|---|
| `GET` | `/hotl` | List logs. Query: `?agent=budget-agent&unread_only=true` |
| `POST` | `/hotl` | Agent writes a run summary |
| `POST` | `/hotl/{id}/read` | Mark single log as read |
| `POST` | `/hotl/read-all` | Mark all read. Query: `?agent=budget-agent` |

`POST /hotl` body:
```json
{
  "agent": "budget-agent",
  "run_id": "run-xyz789",
  "summary": {
    "overview": "Processed 3 receipts, updated Groceries category.",
    "tools": [{ "name": "update_sheet", "params": { "row": 12 }, "result": "ok" }],
    "thoughts": []
  }
}
```

### Run Records

| Method | Path | Description |
|---|---|---|
| `GET` | `/runs` | List runs. Query: `?agent=budget-agent&limit=50` |
| `POST` | `/runs/start` | Agents can manually open a run record. Query params: `agent`, `run_id` |
| `POST` | `/runs/{run_id}/finish` | Close a run. Body: `{"status": "done", "token_count": 0, "cost_usd": 0.0}` |

Note: `/agents/{name}/run` automatically creates and closes run records — agents don't need to call these for chat runs.

### Schedules

Supports multiple workflows per agent (e.g. `weekly-review` + `daily-sync` on the same agent).

| Method | Path | Description |
|---|---|---|
| `GET` | `/schedules` | All schedules across all agents |
| `POST` | `/schedules` | Create or update a schedule |
| `POST` | `/schedules/{agent}/trigger` | Manually fire a workflow now. Query: `?workflow=default` |

`POST /schedules` body:
```json
{
  "agent": "budget-agent",
  "workflow": "weekly-review",
  "cron_expr": "0 9 * * 1",
  "enabled": true,
  "task_prompt": "Run the weekly budget review and flag any overspending."
}
```

`cron_expr` format: standard 5-field cron (`minute hour day month weekday`).

### Stats & Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/stats` | Token counts, cost, run totals per agent |
| `GET` | `/search?q=groceries` | Full-text search across HOTL, HITL, and memory files |

---

## Testing Guide (for Frontend Integration Agent)

These steps verify the full stack without needing all agents running.

### 1. Start the gateway

```bash
cd /path/to/jimmys-agents
python -m uvicorn shared.api_server:app --port 8080 --reload
```

Confirm: `curl localhost:8080/ok` → `{"ok":true}`

### 2. Verify agent registry loads

```bash
curl localhost:8080/agents
```

Expected: all 4 agents listed with `"status": "DOWN"` (no agent processes running yet) and `"circuit": "CLOSED"`.

### 3. Test 404 for unknown agent

```bash
curl -X POST localhost:8080/agents/fake-agent/run \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role":"user","content":"hello"}]}'
```

Expected: `404 Agent 'fake-agent' not registered.`

### 4. Test circuit breaker

With an agent DOWN, call `/run` 3+ times:
```bash
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST localhost:8080/agents/budget-agent/run \
    -H "Content-Type: application/json" \
    -d '{"messages": [{"role":"user","content":"test"}]}'
done
```

Expected: first 3 return `500` (connection refused, proxied as error), 4th returns `503` (circuit OPEN).
Check circuit state: `curl localhost:8080/agents | jq '."budget-agent".circuit'` → `"OPEN"`

### 5. Test rate limiting

```bash
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST localhost:8080/agents/budget-agent/run \
    -H "Content-Type: application/json" \
    -d '{"messages": [{"role":"user","content":"test"}]}'
done
```

Expected: first 10 (or until circuit opens) return non-429, 11th returns `429`.

### 6. Test hot reload (add/remove agent)

```bash
# Add a test entry to agents.yaml:
# test-agent:
#   port: 9999
#   dir: test-agent
#   enabled: true
#   rate_limit: "5/minute"

curl -X POST localhost:8080/registry/reload
curl localhost:8080/agents | jq 'keys'
# "test-agent" should appear

# Remove from agents.yaml, reload again
curl -X POST localhost:8080/registry/reload
curl -X POST localhost:8080/agents/test-agent/run \
  -H "Content-Type: application/json" -d '{}'
# Expected: 404
```

### 7. Test HITL round-trip

```bash
# Create a pending item (simulating an agent)
curl -X POST localhost:8080/hitl \
  -H "Content-Type: application/json" \
  -d '{"agent":"budget-agent","item_type":"receipt_entry","payload":{"amount":42.50,"vendor":"Publix"}}'
# Returns: {"id": 1}

# Fetch it
curl localhost:8080/hitl/1

# Resolve it
curl -X POST localhost:8080/hitl/1/resolve \
  -H "Content-Type: application/json" \
  -d '{"decision":"approved","comment":"Looks right"}'

# Nav count should now show 0 pending
curl localhost:8080/nav-counts
```

### 8. Test AG-UI stream with a running agent

Start `budget-agent` on port 8003 (must use `ag-ui-langgraph`'s `add_langgraph_fastapi_endpoint` to expose `/run`).

```bash
curl -N -X POST localhost:8080/agents/budget-agent/run \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "thread_id": "test-thread-001",
    "messages": [{"role":"user","content":"Hello, what can you help me with?"}]
  }'
```

Expected: SSE lines starting with `event:` and `data:` per AG-UI spec. Run should appear in `GET /runs`.

### 9. Test multi-workflow schedule

```bash
curl -X POST localhost:8080/schedules \
  -H "Content-Type: application/json" \
  -d '{"agent":"budget-agent","workflow":"weekly-review","cron_expr":"0 9 * * 1","enabled":true}'

curl -X POST localhost:8080/schedules \
  -H "Content-Type: application/json" \
  -d '{"agent":"budget-agent","workflow":"daily-sync","cron_expr":"0 7 * * *","enabled":false}'

curl localhost:8080/schedules
# Both workflows listed for budget-agent
```

---

## Agent-Side Contract

Each agent process must:

1. Expose `/ok` → `{"ok": true}` (health check, 2s timeout)
2. Expose `/run` as an AG-UI POST endpoint (use `add_langgraph_fastapi_endpoint` from `ag-ui-langgraph`)
3. Expose `/invoke` for scheduled (non-streaming) runs — LangGraph provides this by default

Agents MAY call back to the gateway:
- `POST localhost:8080/hitl` — to surface items needing human approval
- `POST localhost:8080/hotl` — to log a run summary

Memory is file-based. Agents write directly to their own `MEMORY.md` and `RULES.md`. The gateway reads them via `GET /agents/{name}/memory` and `GET /agents/{name}/rules`.
