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

**Adding a new agent**:
1. Copy `agents/_template/` to `agents/{name}/`
2. Edit `agents/{name}/agent.py` and `skills/` to define the agent.
3. Add an entry to `agents.yaml` (copy format from existing entry).
4. Add an entry to `frontend/src/lib/agents.ts` (copy existing pattern).
5. Add a `run-{name}` target to `Makefile` (copy existing target).
6. Run `POST http://localhost:8080/registry/reload` to hot-load without restart.

---

## deepagent Pattern (reference: `agents/budget-deepagent/`)

All new agents use `create_deep_agent`. Do NOT use `AgentExecutor` or `create_agent`.

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware import AgentMiddleware

class MyMiddleware(AgentMiddleware):
    async def before_agent(self, state, runtime): ...  # pre-run hook
    async def after_agent(self, state, runtime): ...   # post-run hook (post HOTL here)

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
- `GET /agents/{name}/agents-md`, `PUT /agents/{name}/agents-md` — read/write agent AGENTS.md from filesystem

---

## Context Retrieval Hooks

Read these before working in the corresponding areas:

| Working on | Read first |
|---|---|
| `backend/auth_middleware.py`, auth flow | `docs/dev-notes/auth-flow.md` |
| `backend/db_postgres.py`, `backend/sql/`, `backend/migrations/` | `docs/dev-notes/database.md` |
| `frontend/src/` (any component, hook, or API route) | `docs/dev-notes/frontend-patterns.md` |
| Current PR, what was recently built, what's next | `docs/dev-notes/active-state.md` |
| Bugs, open issues, resolved history | `docs/issues.md` |
| System architecture, run lifecycle, HITL/HOTL flow | `docs/system-overview.md` |
| Building or modifying an agent | `docs/deepagents.md` + `agents/_template/` |
| AG-UI protocol, stream events | `docs/ag-ui-api.md` |

---

## Active Rules

- **HOTL is gateway-owned**: The gateway's `StreamTranslator` accumulates tool calls, cost, and tokens from the AG-UI stream and writes the HOTL entry on stream close. Agents do NOT call `POST /hotl` directly.
- **HITL protocol**: Agent calls `POST /hitl` with `X-Internal-Key` header → polls `GET /hitl/{id}` → dashboard shows approve/reject → agent continues on next poll.
- **AGENTS.md per agent**: `{agent.dir}/skills/AGENTS.md` is the agent's persistent notebook. Dashboard reads/writes via `GET/PUT /agents/{name}/agents-md`. This is the only per-agent memory the dashboard exposes. Do not create `MEMORY.md`/`RULES.md` UI — those are agent-internal.
- **APScheduler in backend**: Reads `schedules` DB table on startup. `/schedules` API hot-reloads scheduler — no restart needed.
- **Per-agent accent colors**: gmail=#00ff88, calendar=#00d4ff, budget=#a855f7, job-chain=#f59e0b.
- **Secrets in `secrets/`**: Agents look for `../../secrets/` (two levels up from `agents/{name}/`).
- **Sheet locking in finally**: job-app-chain locks Cell A1 (RED). Must unlock (GREEN) in finally block — never leave locked.
- **Gemini tool compatibility**: Avoid batch tool schemas. Use individual atomic tools only.
- **temperature=0**: All agents use deterministic outputs.
- **LangSmith traces**: MetricsCallback only works in REPL mode. For `langgraph dev` mode, LangSmith traces automatically via env vars.
- **AG-UI stream**: Frontend chat → `POST /api/chat/{agent}` (Next.js proxy) → `POST /agents/{name}/run` (gateway) → agent `/runs/stream` (LangGraph). The gateway translates LangGraph SSE → AG-UI events.
- **docs/issues.md is the living issue tracker**: Update it when bugs are fixed or new issues are found.
- **docs/dev-notes/active-state.md is the session handoff doc**: Update it at the end of any significant work session with what changed, what's next, and any active decisions made.
- **`make install` uses `$(PYTHON) -m pip`**: This ensures deps install to the correct Python 3.13 venv, not system Python.
- **`--no-browser` on langgraph dev**: LangSmith Studio opens via `http://localhost:{port}` not `0.0.0.0`. Always use `--no-browser` in Makefile targets.
- **Auth is Supabase (email OTP)**: Backend requires `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` (Postgres). Frontend requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. See `.env.example`.
- **DB is Postgres, not SQLite**: `backend/db_postgres.py` replaces `backend/db.py`. All queries use asyncpg with a module-level pool (`_pool`). The pool is set during FastAPI lifespan — never import db.py for new code.
- **All SQL in `backend/sql/`**: Named query files parsed by `backend/sql_loader.py`. No inline SQL in `api_server.py` or `db_postgres.py`.
- **Single-user: no tenant scoping**: All DB queries are global. No `tenant_id` anywhere. `request.state.user_id` is set by auth middleware (Supabase sub or "internal") but not used for data scoping.
- **Thread IDs format**: `thread-{agent}-{uuid4}`. The API validates the prefix on history fetch.
- **APScheduler uses module-level `_pool`**: Scheduler jobs can't use `request.state`. `trigger_agent_run` and `_reload_schedules` use `_pool` directly — don't refactor to use request context.
- **CORS preflight skips auth**: The `_auth` HTTP middleware in `api_server.py` skips `OPTIONS` requests. This is intentional — never add auth checks to OPTIONS.
- **Models via `backend/models.py`**: Agents should import `gemini_flash_model` or `free_nvidia_model` from `models.py` instead of instantiating LLM clients directly. `free_nvidia_model` needs its model ID updated — `nvidia/llama-nemotron-embed-vl-1b-v2:free` is an embedding model; use `nvidia/llama-3.1-nemotron-70b-instruct:free` for a free chat LLM.

---

## How to Add a Rule
When you fix a non-obvious bug, make an architectural decision, or Jimmy says "add this to rules" — append a bullet to Active Rules above with a short explanation of *why* the rule exists.
