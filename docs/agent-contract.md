# Agent Contract

Everything an agent must satisfy to work with the jimmys-agents harness. The harness is framework-agnostic — any LangGraph-compatible server qualifies. Deepagents using `langgraph dev` satisfy this contract by default (except where noted below).

---

## Required Endpoints

Every agent process must expose these three endpoints:

### `GET /assistants`

Health check. The gateway polls this every 2 seconds to determine agent status. A 200 response means the agent is running.

LangGraph dev exposes this automatically. **Do not use `/ok` — `langgraph dev` does not expose it.**

Expected response:
```json
[{"graph_id": "agent", "assistant_id": "...", "created_at": "..."}]
```

### `POST /runs/stream`

Streaming run endpoint. Gateway calls this for all chat and scheduled streaming runs.

**Request body (from gateway):**
```json
{
  "assistant_id": "agent",
  "input": {
    "messages": [{"role": "human", "content": "..."}]
  },
  "config": {
    "configurable": {
      "thread_id": "thread-abc123"
    }
  },
  "stream_mode": ["messages"]
}
```

**Response:** `text/event-stream` — LangGraph native SSE format. The gateway translates this to AG-UI internally.

LangGraph dev exposes this automatically.

### `POST /runs`

Blocking run endpoint. Gateway uses this for scheduled runs that don't need live streaming.

**Request body:**
```json
{
  "assistant_id": "agent",
  "input": {
    "messages": [{"role": "human", "content": "Run your scheduled task."}]
  },
  "config": {
    "configurable": {
      "thread_id": "thread-schedule-{agent}-{workflow}"
    }
  }
}
```

**Response:** JSON with final run state.

LangGraph dev exposes this automatically.

---

## HITL Callback (optional, agent-initiated)

If the agent needs a human decision before continuing, it calls back to the gateway:

```python
import httpx

async def request_approval(item_type: str, payload: dict) -> str:
    """Call gateway HITL and poll until resolved. Returns 'approved' or 'rejected'."""
    async with httpx.AsyncClient() as client:
        # Create the HITL item
        r = await client.post(
            "http://localhost:8080/hitl",
            json={"agent": "my-agent", "item_type": item_type, "payload": payload}
        )
        item_id = r.json()["id"]

        # Poll until resolved
        import asyncio
        while True:
            r = await client.get(f"http://localhost:8080/hitl/{item_id}")
            item = r.json()
            if item["status"] != "pending":
                return item["decision"]  # "approved" or "rejected"
            await asyncio.sleep(5)
```

Agents do **not** call `/hotl`. The gateway builds HOTL entries automatically from the run stream.

---

## Filesystem Conventions

### Directory Structure

```
agents/{name}/
  agent.py              # LangGraph graph + agent definition
  langgraph.json        # {"graphs": {"agent": "./agent.py:agent"}}
  skills/
    AGENTS.md           # Agent's persistent memory (written by agent, read by dashboard)
    {skill-name}/
      SKILL.md          # Skill instructions
  RULES.md              # Agent's self-authored rules (written by agent, read by dashboard)
  data/                 # Agent's working data (CSV files, state files)
```

### `skills/AGENTS.md` — Persistent Memory

This is the agent's notebook. The agent reads and writes it across runs to maintain continuity. The gateway serves it at `GET /agents/{name}/memory` — the dashboard Memory tab displays it.

Format: free-form Markdown. No frontmatter required. Example:

```markdown
# Budget Agent Memory

Last updated: 2026-03-27

## Budget Structure
- Groceries: $400/month (updated 2026-03-15)
- Utilities: $250/month

## Notes
- Spreadsheet ID: 1BxiMVs0...
- Publix receipts should go under Groceries
```

The agent should update this file after significant runs (new categories, user preferences, structural changes). Use `write_file` or `edit_file` tool with path `skills/AGENTS.md`.

### `RULES.md` — Self-Authored Rules

The agent writes rules it discovers during operation — invariants it must always follow. The gateway serves it at `GET /agents/{name}/rules`.

Example:
```markdown
# Budget Agent Rules

- Always lock Sheet A1 (RED) before writing to Sheets. Unlock (GREEN) in finally.
- Never modify rows above row 3 in any sheet (header rows).
- Receipts without a clear category → ask for HITL approval before filing.
```

### `FilesystemBackend` Root

When using `FilesystemBackend`, set `root_dir = Path(__file__).parent.absolute()`. This scopes all file tools to the agent's own directory. The agent can read/write anywhere within `agents/{name}/`.

```python
from deepagents.backends import FilesystemBackend
from pathlib import Path

backend = FilesystemBackend(root_dir=Path(__file__).parent.absolute())
```

For accessing secrets (OAuth tokens, API keys), use `../../secrets/` (two levels up from agent dir). This is outside the `FilesystemBackend` root — use direct Python file reads, not the file tools.

---

## Deepagent Pattern

Reference: `agents/budget-deepagent/agent.py`

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware import AgentMiddleware
from pathlib import Path

class MyMiddleware(AgentMiddleware):
    async def abefore_agent(self, state, runtime):
        """Pre-run hook. Return None for no state change."""
        # Domain setup: sync data sources, init state, etc.
        return None

    async def aafter_agent(self, state, runtime):
        """Post-run hook. Return None for no state change."""
        # Domain teardown: sync data back, cleanup, etc.
        # Do NOT call /hotl — the gateway handles HOTL automatically.
        return None

agent = create_deep_agent(
    model=llm,
    tools=tools,
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    backend=FilesystemBackend(root_dir=Path(__file__).parent.absolute()),
    middleware=[MyMiddleware()],
)
```

### Runtime API (LangGraph 0.7.66+)

The `runtime` object passed to middleware hooks may vary by LangGraph version. Do not assume `runtime.config` exists. Access thread config from the LangGraph `RunnableConfig` or from `state` instead.

To get the thread_id in a middleware hook:
```python
# Option 1: from the state (if your graph puts it there)
thread_id = state.get("configurable", {}).get("thread_id")

# Option 2: not needed — HOTL is gateway-owned, don't use it for that
```

### Skills System

Skills are instruction chunks injected into the system prompt on demand. The agent sees skill names + descriptions at all times and calls `read_skill(name)` when a task matches.

```
skills/
  build-budget/
    SKILL.md           # frontmatter: name, description
  budget-analysis/
    SKILL.md
  AGENTS.md            # memory file (listed in memory= param)
```

SKILL.md format:
```markdown
---
name: build-budget
description: One sentence shown always to decide when to use this skill.
---

# Build Budget

Full instructions here...
```

Rules: directory name must match `name` field exactly (lowercase, hyphens).

---

## `langgraph.json`

Minimum required config for `langgraph dev`:

```json
{
  "graphs": {
    "agent": "./agent.py:agent"
  }
}
```

The `"agent"` key is the `assistant_id` the gateway uses in all requests.

---

## `agents.yaml` Entry

Add to `agents.yaml` at project root:

```yaml
agents:
  my-agent:
    port: 8006              # unique port not used by any other agent
    dir: agents/my-agent    # path relative to project root
    enabled: true
    rate_limit: "10/minute" # sliding window per IP
```

---

## Starting the Agent

```bash
cd agents/my-agent
langgraph dev --port 8006 --no-browser
```

Or add to Makefile:
```makefile
run-my-agent:
    .venv/bin/langgraph dev --port 8006 --no-browser \
        --config agents/my-agent/langgraph.json
```

---

## Verification Checklist

After adding a new agent, verify:

```bash
# 1. Health check
curl http://localhost:8006/assistants
# Expected: JSON array with your graph

# 2. Register and confirm
curl -X POST http://localhost:8080/registry/reload
curl http://localhost:8080/agents | python -m json.tool
# Expected: your agent listed with status RUNNING

# 3. Chat smoke test
curl -N -X POST http://localhost:8080/agents/my-agent/run \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"thread_id":"test-001","messages":[{"role":"user","content":"Hello"}]}'
# Expected: AG-UI events streaming (RUN_STARTED, TEXT_MESSAGE_*, RUN_FINISHED)

# 4. Run record created
curl http://localhost:8080/runs?agent=my-agent
# Expected: one run record with status "done"

# 5. HOTL entry created
curl http://localhost:8080/hotl?agent=my-agent
# Expected: one log entry with overview
```

---

## Non-Deepagent Agents

Any LangGraph graph works. Vanilla LangGraph, custom agents, automations — as long as they expose `/runs/stream`, `/runs`, and `/assistants`, the harness handles them identically.

For non-LangGraph agents that natively emit AG-UI (e.g., agents built with `ag-ui-langgraph`), the gateway detects the format and passes through without translation. *(Future capability — not yet implemented.)*

---

## What the Harness Owns (Agents Don't Need To)

| Concern | Owner |
|---|---|
| Run lifecycle (open/close run_record) | Gateway |
| HOTL logging | Gateway (extracted from stream) |
| Token/cost tracking | Gateway (from usage_metadata) |
| Rate limiting | Gateway (from agents.yaml config) |
| Circuit breaking | Gateway (auto) |
| Schedule management | Gateway (APScheduler) |
| AG-UI translation | Gateway |
| HITL inbox UI | Gateway + Dashboard |

Agents own: their domain logic, their skills/memory files, their data sync (e.g., Sheets), and their HITL callbacks.
