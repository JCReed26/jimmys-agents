# DeepAgents — How It Works

Reference for the `budget-deepagent` implementation. Covers architecture, communication, configuration, and testing.

---

## What Is DeepAgents?

DeepAgents is a Python framework built on top of LangGraph that adds a structured middleware pipeline, file-based skill/memory systems, and pluggable backends to a standard ReAct-style agent loop. It wraps LangGraph's `CompiledStateGraph` — you get full LangGraph compatibility (streaming, thread persistence, `/playground`) while the framework handles prompt construction, file I/O, skill injection, and context summarization automatically.

---

## Architecture

```
User Message
     │
     ▼
┌─────────────────────────────────────────────────────┐
│                  Middleware Stack                    │
│                                                     │
│  BudgetSyncMiddleware   ← custom (abefore/aafter)   │
│  TodoListMiddleware     ← tracks in-progress tasks  │
│  FilesystemMiddleware   ← exposes read/write tools  │
│  SummarizationMiddleware← compresses old messages   │
│  PromptCachingMiddleware← Anthropic cache headers   │
│  PatchToolCallsMiddleware← fixes model quirks       │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
          ┌────────────────┐
          │   LLM (Gemini) │  ← with skill list in system prompt
          │  + Tools       │  ← DuckDuckGo, filesystem tools
          └────────────────┘
                   │
                   ▼
          ┌────────────────┐
          │    Backend     │  ← FilesystemBackend (real disk)
          │  (real files)  │
          └────────────────┘
```

### Backends

| Backend | What it does |
|---------|-------------|
| `StateBackend` (default) | Virtual in-memory filesystem — files don't persist to disk |
| `FilesystemBackend` | Points to a real directory on disk — agent edits are real files |

`budget-deepagent` uses `FilesystemBackend(root_dir=Path(__file__).parent.absolute())`, so the agent's file tools operate inside the `budget-deepagent/` directory. When it calls `write_file("data/Expenses.csv", ...)`, the file lands at `budget-deepagent/data/Expenses.csv`.

### Built-in File Tools

When `FilesystemBackend` is active, the middleware automatically provides these tools to the LLM:

- `read_file(path)` — read any file relative to `root_dir`
- `write_file(path, content)` — create or overwrite a file
- `edit_file(path, old, new)` — targeted string replacement (avoids full rewrites)
- `list_directory(path)` — list files/dirs
- `delete_file(path)` — delete a file

The agent never needs to import these — they are injected at runtime by `FilesystemMiddleware`.

---

## Skills System

Skills are chunks of instructional context injected into the agent's system prompt on demand. The agent is shown a list of skill names + descriptions at startup. When a task matches a skill, the agent calls `read_skill(name)` to load the full instructions.

### Directory Structure

```
skills/
  build-budget/
    SKILL.md          ← required — frontmatter + instructions
  budget-tasks/
    SKILL.md
  budget-analysis/
    SKILL.md
  AGENTS.md           ← memory file (listed in `memory=`)
```

### SKILL.md Format

```markdown
---
name: build-budget           # must match directory name exactly (lowercase, hyphens)
description: One sentence shown to the agent at all times to decide when to use this skill.
---

# Build Budget

Full instructions here — only loaded when the agent decides to read this skill.
```

**Rules:**
- Directory name must exactly match the `name` field — deepagents validates this on load
- Names: lowercase alphanumeric + hyphens only, no underscores
- Description is always in context; body is loaded on demand (keeps token usage low)

### Configuration in agent.py

```python
skills = ["skills/"]      # source path — deepagents finds all subdirs with SKILL.md
memory = ["skills/AGENTS.md"]  # files the agent can freely read and update
```

---

## Memory System

Memory files are listed in the `memory=` parameter. The agent can read and write these files freely across runs. `skills/AGENTS.md` serves as persistent working memory — the agent updates it after significant runs (new budget structure, new categories, etc.).

Unlike skills, memory files have no frontmatter requirement. They are full-text files the agent treats as its own notebook.

---

## Middleware

Middleware classes intercept the agent lifecycle. Custom middleware inherits from `AgentMiddleware` (from `langchain.agents.middleware.types`).

### Hooks

| Hook | When it fires | Signature |
|------|---------------|-----------|
| `abefore_agent` | Before the LLM loop starts | `(self, state, runtime) → None` |
| `aafter_agent` | After the LLM loop ends | `(self, state, runtime) → None` |
| `awrap_model_call` | Around each LLM invocation | wraps the model call |
| `modify_request` | Before each LLM call | mutate the request in place |

`state` is the LangGraph state dict (contains `messages`). `runtime` has `runtime.config` (configurable dict, thread_id, etc.).

### BudgetSyncMiddleware (budget-deepagent)

```python
class BudgetSyncMiddleware(AgentMiddleware):

    async def abefore_agent(self, state, runtime):
        sync_from_sheets_to_csv()   # pull latest data from Google Sheets → CSV
        return None

    async def aafter_agent(self, state, runtime):
        sync_from_csv_to_sheets()   # push agent edits → Google Sheets
        # also POST run summary to dashboard HOTL feed
        await httpx.post("http://localhost:8080/hotl", json={...})
        return None
```

**Important:** returning `None` from these hooks means "no state change". You can return a partial state dict to modify messages or other state fields.

---

## Communication — LangGraph HTTP API

DeepAgents agents are served by `langgraph dev`, which exposes a standard LangGraph HTTP API. The Next.js dashboard proxies chat directly to this API.

### Endpoints (port 8003 for budget)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/runs/stream` | POST | Stream agent responses (SSE) — used by dashboard chat |
| `/runs` | POST | Invoke agent (blocking) |
| `/assistants` | GET | List available graphs |
| `/threads` | POST | Create a conversation thread |
| `/threads/{id}/state` | GET | Inspect thread state/messages |
| `/docs` | GET | Interactive API docs (Swagger UI) |
| `/playground` | — | LangSmith Studio UI for the agent |

### Chat Request Format

This is what `next-dashboard/src/app/api/chat/[agent]/route.ts` sends:

```json
POST http://localhost:8003/runs/stream
{
  "assistant_id": "agent",
  "input": {
    "messages": [
      { "role": "human", "content": "What's in my budget?" }
    ]
  },
  "config": {
    "configurable": {
      "thread_id": "thread-abc123"
    }
  },
  "stream_mode": ["messages"]
}
```

The response is a Server-Sent Events stream. Each event is a JSON chunk with message deltas or tool call data.

### Thread Persistence

Each conversation has a `thread_id`. The LangGraph runtime saves all messages per thread. On subsequent messages in the same thread, the full conversation history is automatically included — no manual history management needed.

---

## Sheets ↔ CSV Sync (`sheets_to_csv.py`)

```
Before agent:   Google Sheets → data/*.csv
After agent:    data/*.csv    → Google Sheets
```

Auth uses the same OAuth2 credentials as the old budget-agent (`secrets/credentials.json` + `secrets/sheets_token.json`). Spreadsheet ID is read from `../data/budget_state.json`.

If the token is expired, `_get_gspread_client()` automatically runs the browser OAuth flow and saves a fresh token.

---

## Setup Checklist

```
secrets/credentials.json      ← OAuth2 client credentials (Google Cloud Console)
secrets/sheets_token.json     ← OAuth token (auto-generated on first auth)
data/budget_state.json        ← {"spreadsheet_id": "YOUR_SHEET_ID"}
.env                          ← GOOGLE_API_KEY=...
```

Install dependencies:
```bash
make install
# or: .venv/bin/python3.13 -m pip install -r requirements.txt
```

> **Python version note:** The venv may have both Python 3.13 and 3.14. `langgraph dev` uses 3.13. Always install with `.venv/bin/python3.13 -m pip install` to avoid version mismatch.

---

## Running

```bash
make run-budget        # interactive — langgraph dev on port 8003, hot-reload on file changes
make start-all         # background — all agents + API server + dashboard
```

---

## Testing

### 1. Import Check (fastest)

Verify the agent loads with no errors:

```bash
cd budget-deepagent && python -c "from agent import agent; print('OK')"
```

### 2. Auth Check

Verify Google OAuth is working:

```bash
cd budget-deepagent && python -c "
from sheets_to_csv import _get_gspread_client
gc = _get_gspread_client()
print('Auth OK —', gc.auth.token[:10], '...')
"
```

### 3. Sheets Sync Check

Verify data flows from Sheets → CSV and back:

```bash
cd budget-deepagent && python -c "
from sheets_to_csv import sync_from_sheets_to_csv, sync_from_csv_to_sheets
sync_from_sheets_to_csv()
print('CSVs written to data/:')
import os; print(os.listdir('data'))
"
```

### 4. Server Smoke Test

Start the server and hit the health endpoint:

```bash
make run-budget &
sleep 3
curl http://localhost:8003/assistants | python -m json.tool
```

Expected: JSON with an `agent` entry.

### 5. Chat via curl

Test a full round-trip with streaming:

```bash
curl -N -X POST http://localhost:8003/runs/stream \
  -H "Content-Type: application/json" \
  -d '{
    "assistant_id": "agent",
    "input": {
      "messages": [{"role": "human", "content": "What is in my budget right now?"}]
    },
    "config": {"configurable": {"thread_id": "test-thread-1"}},
    "stream_mode": ["messages"]
  }'
```

You'll see SSE events streaming back. Look for `event: messages` lines with the agent's response content.

### 6. Playground (interactive)

Open in browser (requires the server to be running):

```
https://smith.langchain.com/studio/?baseUrl=http://0.0.0.0:8003
```

This gives you a full chat UI with tool call visibility, state inspection, and thread history. Best for debugging skills and middleware behavior.

### 7. Skills Load Verification

Check that skills are being discovered:

```bash
cd budget-deepagent && python -c "
from deepagents.backends import FilesystemBackend
from pathlib import Path
backend = FilesystemBackend(root_dir=Path('.').absolute())
items = backend.ls_info('skills/')
print([i['path'] for i in items if i.get('is_dir')])
"
```

Expected: `['skills/build-budget', 'skills/budget-tasks', 'skills/budget-analysis']`

### 8. HOTL Integration Test

With the API server running (`make run-api-server`), trigger a chat and verify the HOTL log appears:

```bash
# 1. Send a message
curl -X POST http://localhost:8003/runs/stream \
  -H "Content-Type: application/json" \
  -d '{"assistant_id":"agent","input":{"messages":[{"role":"human","content":"hello"}]},"config":{"configurable":{"thread_id":"hotl-test"}},"stream_mode":["messages"]}' \
  > /dev/null

# 2. Check HOTL
curl http://localhost:8080/hotl | python -m json.tool
```

---

## Three-Layer Ownership Model

Data and configuration in jimmys-agents is owned at three distinct layers. Each layer has its own storage, access pattern, and mutation rules.

```
Layer 1 — James (filesystem / git)
  agent.py, skills/, CLAUDE.md, Makefile, agents.yaml
  Owned by James. Edited by Claude Code. Committed to git.

Layer 2 — Agent self-writes (Postgres: agent_memory, agent_rules)
  Replaces MEMORY.md + RULES.md on the filesystem.
  The agent reads/writes its own rows. No other tenant sees them.
  Keyed on (tenant_id, agent_name).

Layer 3 — Client/tenant config (Postgres: schedules, hitl, hotl, runs)
  Everything scoped to tenant_id extracted from the Supabase JWT.
  Dashboard reads/writes via the FastAPI gateway.
  James has tenant_id = 4efdeb00-1b23-4031-bc77-555af005a406.
```

### Why This Exists

Before this model, all state lived in SQLite (`data/state.db`) with no isolation. A single-user assumption was baked in everywhere. The three-layer model lets future clients each have their own silo while James retains full control of Layer 1 (code, skills, rules) that no tenant can touch.

### Thread ID Namespacing

Thread IDs are namespaced to prevent cross-tenant LangGraph state mixing:

```
thread-{tenant_id}-{agent_name}-{uuid4}
```

The API server validates this prefix on `/chat/{agent}/history` — requests for a thread that doesn't start with `thread-{your_tenant_id}-` return an empty response, not an error (avoids leaking existence).

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `No module named 'ddgs'` | `pip3.13 install ddgs` — note Python version |
| `custom checkpointer ... will be ignored` | Remove `checkpointer=` from `create_deep_agent()` |
| `invalid_grant` (OAuth) | Token expired/revoked — run auth check (#2 above) to trigger re-auth |
| `No spreadsheet_id in budget_state.json` | Create `data/budget_state.json` with `{"spreadsheet_id": "..."}` |
| Skills not loading | Check directory names match `name` in frontmatter exactly (lowercase, hyphens) |
| Agent starts but skills list empty | Verify `SKILL.md` exists inside each skill subdirectory (not just the `.md` file) |
