# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Vision

**jimmys-agents** is a personal multi-agent automation system. Agents are standalone services managed via **Makefile** + APScheduler. A Next.js 16 + shadcn dashboard (`frontend/`) monitors all agents, shows live run streams, surfaces HITL (Human-in-the-Loop) approve/reject inboxes, and HOTL (Human-on-the-Loop) post-hoc review logs. The system runs locally on a Mac.

**James builds agents. Claude handles system, backend, and orchestration.**

Architecture principles: **simple, minimal, solo-dev DX first**. No overengineering.

---

## Ports

| Service | Port |
|---|---|
| Next.js frontend (`frontend/`) | 3000 |
| FastAPI API server (`backend/api_server.py`) | 8080 |
| gmail-agent | 8001 |
| calendar-agent | 8002 |
| budget-deepagent | 8003 |
| job-app-chain | 8004 |

---

## Repository Structure

```
jimmys-agents/
├── Makefile                    # Root — all dev commands
├── requirements.txt            # Unified Python deps (Python 3.13)
├── agents.yaml                 # Agent registry (name, port, dir, rate limit)
├── agents/                     # All deepagents
│   ├── budget-deepagent/       # REFERENCE pattern — use this for new agents
│   ├── gmail-agent/            # Active, in-progress
│   ├── calendar-agent/         # Active, in-progress
│   └── job-reverse-rercuiter/  # Being built
├── automations/                # LangGraph multi-step workflows
│   └── job-app-chain/          # Scrape → classify → optimize → apply
├── frontend/                   # Next.js 16 dashboard (renamed from next-dashboard)
│   └── src/
│       ├── app/                # Pages + API routes
│       ├── components/         # UI components (shadcn)
│       ├── hooks/              # useAgentChat, useAgUiStream
│       └── lib/                # agents.ts registry, utils
├── backend/                    # FastAPI + shared utilities (renamed from shared)
│   ├── api_server.py           # Central gateway — HITL, HOTL, schedules, runs
│   ├── db.py                   # SQLite schema (data/state.db)
│   ├── auth.py                 # Google OAuth2 helpers
│   ├── metrics_callback.py     # LangSmith instrumentation
│   └── agent_registry.py       # agents.yaml parser
├── docs/                       # Project documentation
│   ├── deepagents.md           # Deepagent pattern guide
│   ├── ag-ui-api.md            # AG-UI protocol spec
│   ├── frontend.md             # Dashboard component docs
│   └── issues.md               # Living bug/issue tracker (keep updated)
├── data/                       # Runtime state (gitignored contents)
│   └── state.db                # SQLite: HITL, HOTL, runs, schedules
├── secrets/                    # Google OAuth tokens (gitignored)
└── tests/                      # Test suite
```

---

## Tech Stack

- **Python 3.13** — all agents and backend
- **deepagents** — agent framework (`create_deep_agent`, skills, middleware)
- **LangGraph** — for multi-node workflows (automations/)
- **LLM**: Gemini 2.5 Flash via `langchain-google-genai` (`temperature=0`)
- **Make** — local process management
- **Next.js 16** — frontend dashboard (App Router, TypeScript, shadcn/ui)
- **FastAPI** — backend API gateway
- **Google APIs** — Sheets, Gmail, Calendar, Drive (OAuth2)
- **LangSmith** — always on when `LANGSMITH_TRACING=true`

---

## Development Commands

```bash
make install          # Install all deps (Python + npm) — uses Python 3.13
make start-all        # Start all services in background, logs in logs/
make stop-all         # Stop all background services

make run-api-server   # FastAPI on :8080 (interactive)
make run-frontend     # Next.js on :3000 (interactive)
make run-gmail        # gmail-agent on :8001 (interactive)
make run-calendar     # calendar-agent on :8002 (interactive)
make run-budget       # budget-deepagent on :8003 (interactive)
make run-job-chain    # job-app-chain LangGraph server on :8004 (interactive)
```

**Adding a new agent**: create `agents/{name}/` with `agent.py` + `langgraph.json` + `skills/`. Add entry to `agents.yaml`. Add `run-{name}` target to Makefile.

---

## deepagent Pattern (reference: `agents/budget-deepagent/`)

All new agents use `create_deep_agent`. Do NOT use `AgentExecutor` or `create_agent`.

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware import AgentMiddleware

class MyMiddleware(AgentMiddleware):
    async def abefore_agent(self, state, runtime): ...  # pre-run hook
    async def aafter_agent(self, state, runtime): ...   # post-run hook (post HOTL here)

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
- `langgraph.json` — `{"graphs": {"agent": "./agent.py:agent"}}`
- `skills/` — SKILL.md files + AGENTS.md memory
- `MEMORY.md`, `RULES.md` — written by agent during runs

---

## Backend (API Gateway) — `backend/api_server.py`

FastAPI on :8080. All paths:
- `GET /ok` — health check
- `GET /agents` — agent statuses from registry
- `POST /agents/{name}/run` — AG-UI SSE stream (proxies to agent `/runs/stream`)
- `GET /nav-counts` — HITL pending + HOTL unread for badge
- `POST /registry/reload` — hot-reload agents.yaml
- `GET|POST /hitl` — HITL inbox
- `POST /hitl/{id}/resolve` — approve/reject
- `GET|POST /hotl` — HOTL logs
- `POST /hotl/{id}/read`, `POST /hotl/read-all` — mark read
- `GET /runs`, `POST /runs/start`, `POST /runs/{id}/finish` — run lifecycle
- `GET|POST /schedules`, `POST /schedules/{agent}/trigger` — APScheduler
- `GET /stats`, `GET /search` — observability
- `GET /agents/{name}/memory`, `GET /agents/{name}/rules` — file reads

---

## Active Rules

- **State DB at `data/state.db`**: SQLite for all HITL, HOTL, runs, schedules. Schema in `backend/db.py`. Never delete without warning.
- **HITL protocol**: Agent calls `POST /hitl` → polls `GET /hitl/{id}` → dashboard shows approve/reject → stored in DB.
- **HOTL logging**: After each run, agent middleware calls `POST /hotl` with `{tools, thoughts, overview}`. Dashboard shows in `/logs`.
- **MEMORY.md + RULES.md per agent**: Agent writes these. Dashboard reads via `GET /api/memory/{name}`. Never overwrite with unrelated content.
- **APScheduler in backend**: Reads `schedules` DB table on startup. `/schedules` API hot-reloads scheduler — no restart needed.
- **Per-agent accent colors**: gmail=#00ff88, calendar=#00d4ff, budget=#a855f7, job-chain=#f59e0b.
- **Secrets in `secrets/`**: Agents look for `../../secrets/` (two levels up from `agents/{name}/`).
- **Sheet locking in finally**: job-app-chain locks Cell A1 (RED). Must unlock (GREEN) in finally block — never leave locked.
- **Gemini tool compatibility**: Avoid batch tool schemas. Use individual atomic tools only.
- **temperature=0**: All agents use deterministic outputs.
- **LangSmith traces**: MetricsCallback only works in REPL mode. For `langgraph dev` mode, LangSmith traces automatically via env vars.
- **AG-UI stream**: Frontend chat → `POST /api/chat/{agent}` → agent `/runs/stream` directly. Gateway `/agents/{name}/run` is for scheduled runs and workflow monitoring (currently being fixed — see docs/issues.md C-01).
- **docs/issues.md is the living issue tracker**: Update it when bugs are fixed or new issues are found. This file is studied by Claude to maintain context across sessions.
- **`make install` uses `$(PYTHON) -m pip`**: This ensures deps install to the correct Python 3.13 venv, not system Python.
- **`--no-browser` on langgraph dev**: LangSmith Studio opens via `http://localhost:{port}` not `0.0.0.0`. Always use `--no-browser` in Makefile targets.
- **Auth is Supabase (email OTP)**: Backend requires `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` (Postgres). Frontend requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. See `.env.example`.
- **DB is Postgres, not SQLite**: `backend/db_postgres.py` replaces `backend/db.py`. All queries use asyncpg with a module-level pool (`_pool`). The pool is set during FastAPI lifespan — never import db.py for new code.
- **Multi-tenant: all queries scope by tenant_id**: JWT is verified in `backend/auth_middleware.py`; `tenant_id` is extracted and attached to `request.state`. Every DB function in `db_postgres.py` requires `tenant_id` as first arg.
- **Thread IDs are namespaced**: Format is `thread-{tenant_id}-{agent}-{uuid4}`. The API validates the prefix on `/chat/{agent}/history` — never generate bare thread IDs. See `docs/deepagents.md` for the three-layer ownership model.
- **APScheduler uses module-level `_pool`**: Scheduler jobs can't use `request.state`. `trigger_agent_run` and `_reload_schedules` in `api_server.py` use the global `_pool` directly — don't refactor to use request context.
- **CORS preflight skips auth**: The `_auth` HTTP middleware in `api_server.py` skips `OPTIONS` requests to allow CORS preflight. This is intentional — never add auth checks to OPTIONS.

---

## How to Add a Rule
When you fix a non-obvious bug, make an architectural decision, or Jimmy says "add this to rules" — append a bullet to Active Rules above with a short explanation of *why* the rule exists.
