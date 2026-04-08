# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Vision

**jimmys-agents** is a personal multi-agent automation system. Agents are standalone LangGraph services. A Next.js dashboard (`frontend/`) shows agent status and provides a CopilotKit chat interface for testing each agent. The system runs locally on a Mac.

**James builds agents. Claude handles system and orchestration.**

Architecture principles: **simple, minimal, solo-dev DX first**. No overengineering.

---

## Ports

| Service | Port |
|---|---|
| Next.js frontend (`frontend/`) | 3000 |
| gmail-agent | 8001 |
| calendar-agent | 8002 |
| budget-deepagent | 8003 |
| job-search-agent | 8005 |

---

## Repository Structure

```
jimmys-agents/
├── Makefile                    # All dev commands
├── requirements.txt            # Unified Python deps (Python 3.13)
├── agents.yaml                 # Agent registry (name, port, dir)
├── agents/                     # All agents
│   ├── _template/              # REFERENCE — copy this for new agents
│   ├── budget-deepagent/       # Active
│   ├── gmail-agent/            # Active
│   ├── calendar-agent/         # Active
│   └── job-search-agent/       # Active
├── frontend/                   # Next.js 16 dashboard
│   └── src/
│       ├── app/                # Pages + API routes
│       ├── components/         # UI components (shadcn)
│       └── lib/                # agents.ts registry, utils
├── backend/                    # Shared Python utilities
│   ├── models.py               # LLM model definitions
│   └── metrics_callback.py     # LangSmith stub
├── docs/                       # Project documentation
├── secrets/                    # Google OAuth tokens (gitignored)
└── tests/                      # Test suite
```

---

## Tech Stack

- **Python 3.13** — all agents
- **deepagents** — agent framework (`create_deep_agent`, skills, middleware)
- **LangGraph** — agent graph runtime (all agents use `langgraph dev`)
- **LLM**: Gemini 2.5 Flash via `langchain-google-genai` (`temperature=0`)
- **Make** — local process management
- **Next.js 16** — frontend dashboard (App Router, TypeScript, shadcn/ui)
- **CopilotKit** — chat UI + AG-UI runtime (`/api/copilotkit` → agent `/runs/stream`)
- **Google APIs** — Sheets, Gmail, Calendar, Drive (OAuth2)
- **LangSmith** — always on when `LANGSMITH_TRACING=true`

---

## Development Commands

```bash
make install          # Install all deps (Python + npm) — uses Python 3.13
make start-all        # Start all services in background, logs in logs/
make stop-all         # Stop all background services

make run-frontend     # Next.js on :3000
make run-gmail        # gmail-agent on :8001
make run-calendar     # calendar-agent on :8002
make run-budget       # budget-deepagent on :8003
make run-job-search   # job-search-agent on :8005
```

**Adding a new agent**:
1. Copy `agents/_template/` to `agents/{name}/`
2. Edit `agents/{name}/agent.py` and `skills/` to define the agent.
3. Add an entry to `agents.yaml` (copy format from existing entry).
4. Add an entry to `frontend/src/lib/agents.ts` (copy existing pattern).
5. Add a `run-{name}` target to `Makefile` (copy existing target).

---

## deepagent Pattern (reference: `agents/budget-deepagent/`)

All new agents use `create_deep_agent`. Do NOT use `AgentExecutor` or `create_agent`.

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware import AgentMiddleware

class MyMiddleware(AgentMiddleware):
    async def before_agent(self, state, runtime): ...  # pre-run hook
    async def after_agent(self, state, runtime): ...   # post-run hook

agent = create_deep_agent(
    model=llm,
    tools=tools,
    skills=["skills/"],           # SKILL.md instruction modules
    memory=["skills/AGENTS.md"],  # persistent agent notebook
    backend=FilesystemBackend(...),
    middleware=[MyMiddleware()],
)
```

Each agent dir has:
- `agent.py` — agent definition (minimal, ~100 lines)
- `server.py` — FastAPI AG-UI wrapper (for budget-deepagent pattern)
- `langgraph.json` — `{"graphs": {"agent": "./agent.py:agent"}}`
- `skills/` — SKILL.md files + AGENTS.md memory

---

## Frontend API Routes (active)

| Route | Purpose |
|---|---|
| `GET /api/agents` | Live agent status (polls each agent's `/runs/stream/health`) |
| `GET /api/agents-md/[name]` | Read agent's AGENTS.md from filesystem |
| `POST /api/copilotkit` | CopilotKit runtime — proxies chat to agent `/runs/stream` |
| `GET /api/health` | Health check for all agent services |

---

## Context Retrieval Hooks

| Working on | Read first |
|---|---|
| `frontend/src/` (any component or API route) | `docs/dev-notes/frontend-patterns.md` |
| Bugs, open issues | `docs/issues.md` |
| Building or modifying an agent | `docs/deepagents.md` + `agents/_template/` |
| AG-UI protocol, stream events | `docs/ag-ui-api.md` |

---

## Active Rules

- **AGENTS.md per agent**: `{agent.dir}/skills/AGENTS.md` is the agent's persistent notebook. Dashboard reads via `GET /api/agents-md/{name}`. Do not create `MEMORY.md`/`RULES.md` UI — those are agent-internal.
- **Per-agent accent colors**: gmail=#00ff88, calendar=#00d4ff, budget=#a855f7, job-search=#f59e0b.
- **Secrets in `secrets/`**: Agents look for `../../secrets/` (two levels up from `agents/{name}/`).
- **Sheet locking in finally**: Any agent locking a Google Sheet cell must unlock in a `finally` block — never leave locked.
- **Gemini tool compatibility**: Avoid batch tool schemas. Use individual atomic tools only.
- **temperature=0**: All agents use deterministic outputs.
- **LangSmith traces**: For `langgraph dev` mode, LangSmith traces automatically via env vars (`LANGSMITH_TRACING=true`).
- **AG-UI stream**: Frontend chat → `POST /api/copilotkit` → CopilotKit `LangGraphAgent` (uses `@langchain/langgraph-sdk`) → agent LangGraph API (`langgraph dev`). All agents run via `langgraph dev`, NOT `uvicorn server:app`. The `server.py` / `ag_ui_langgraph` pattern is legacy — do not use for new agents.
- **graphId must be "agent"**: Every agent's `langgraph.json` must declare `{"graphs": {"agent": "./agent.py:agent"}}`. The `graphId` in `agents.ts` must match. CopilotKit uses this to find the correct graph on the LangGraph server.
- **`--no-browser` on langgraph dev**: Always use `--no-browser` in Makefile targets.
- **`make install` uses `$(PYTHON) -m pip`**: Ensures deps install to the correct Python 3.13 venv.
- **Auth is Supabase (email OTP)**: Frontend requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. See `.env.example`.
- **Models via `backend/models.py`**: Agents should import `gemini_flash_model` from `models.py` instead of instantiating LLM clients directly.
- **docs/issues.md is the living issue tracker**: Update it when bugs are fixed or new issues are found.

---

## How to Add a Rule
When you fix a non-obvious bug, make an architectural decision, or Jimmy says "add this to rules" — append a bullet to Active Rules above with a short explanation of *why* the rule exists.
