# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Vision

**jimmys-agents** is a personal multi-agent automation system. Each agent is a standalone service managed via **Makefiles** + APScheduler. A Next.js 16 + shadcn-style dashboard (glassmorphism, per-agent neon colors, Framer Motion) monitors all agents, shows live run streams via WebSocket, surfaces HITL (Human-in-the-Loop) approve/reject inboxes, and HOTL (Human-on-the-Loop) post-hoc review logs. The system runs locally on a Mac.

Architecture principles: **simple, minimal, solo-dev DX first**. No overengineering.

## Ports

| Service | Port |
|---|---|
| Next.js dashboard | 3000 |
| FastAPI API server (`shared/api_server.py`) | 8080 |
| gmail-agent (langgraph dev) | 8001 |
| calendar-agent (langgraph dev) | 8002 |
| budget-agent (langgraph dev) | 8003 |
| job-app-chain (langgraph dev) | 8004 |

---

## Tech Stack

- **Python 3.13** — all agents
- **LangChain v1** (`langchain>=1.0`) — use `from langchain.agents import create_agent` (NOT the deprecated `langgraph.prebuilt.create_react_agent`)
- **LangGraph** — for multi-node graph workflows (job-app-chain pattern)
- **LLM**: Gemini 2.5 Flash via `langchain-google-genai` (`temperature=0`)
- **Make** — local process management
- **FastAPI + HTMX** — monitoring frontend
- **Google APIs** — Sheets, Gmail, Calendar, Drive (OAuth2)

---

## Repository Structure

```
jimmys-agents/
├── Makefile                    # Root Makefile for all commands
├── requirements.txt            # Unified dependencies
├── a-dashboard/                # FastAPI + HTMX monitoring dashboard
│   ├── main.py
│   └── templates/
├── gmail-agent/                # Polls inbox every 30 min, classifies emails
├── calendar-agent/             # Google Calendar CRUD
├── budget-agent/               # Google Sheets budget tracking
├── job-app-chain/              # LangGraph workflow: scrape → classify → apply
│   ├── CLAUDE.md               # Job-app-chain-specific specs
│   ├── state.py
│   ├── graph.py
│   └── nodes/
└── shared/                     # Shared utilities (auth helpers, sheet client, etc.)
```

---

## LangChain v1 Conventions

**Always use the new v1 API. Never use deprecated patterns.**

| Deprecated (do NOT use) | Current (use this) |
|---|---|
| `langgraph.prebuilt.create_react_agent` | `from langchain.agents import create_agent` |
| `AgentExecutor` | LangGraph `StateGraph` or `create_agent` |
| `initialize_agent` | `create_agent` |
| `LLMChain` | LCEL: `prompt \| llm \| parser` |

Tool definition uses `@tool` decorator. Bind tools via `llm.bind_tools(tools)`.

---

## Local Development Architecture

The project uses `Makefile` for local development and process management.

```bash
# Install dependencies
make install

# Start all services (dashboard + agents) in background
make start-all

# Stop all services
make stop-all

# Run dashboard only (interactive)
make run-dashboard

# Run a single agent (interactive/debug)
make run-gmail
make run-calendar
make run-budget

# Run job application chain (task)
make run-job-chain
```

**Adding a new agent**: create `agent-name/` directory with agent code. Add a new target to `Makefile`.

---

## Monitoring Frontend

FastAPI + HTMX dashboard at `http://localhost:8080`:
- **Agent status**: running/stopped, last run time, error count
- **HITL inboxes**: approve/reject buttons for items requiring human decision (e.g. job-app-chain job approvals)
- **Logs**: per-agent log streaming (via `logs/` directory tailing if implemented, currently raw file logs)

Agents expose a simple internal API (or write to a shared state file/DB) that the frontend reads. Keep it simple — SQLite or JSON files are fine for state sharing between agent and frontend.

---

## Authentication

- **Google APIs**: OAuth2 via `credentials.json`.
- **Secrets**: Stored in `secrets/` directory (gitignored).
- **Env vars**: `.env` at project root.

---

## Agent Patterns

**Polling agent** (gmail-agent): infinite loop with sleep, try/except for graceful shutdown.

**Interactive agent** (calendar, budget): REPL loop with streaming responses, `InMemorySaver` checkpointer for multi-turn context.

**Graph workflow** (job-app-chain): LangGraph `StateGraph` with typed state (`TypedDict`), parallel branches, sheet-based locking (`Cell A1`: GREEN=unlocked, RED=locked).

**HITL pattern**: agent writes pending items to shared state store → frontend reads and displays → user clicks approve/reject → agent polls for decision before continuing.

---

## Iterative Improvement Rules

> This section is updated whenever a significant bug is fixed, a non-obvious architectural decision is made, or Jimmy explicitly asks to add a rule. It prevents repeating mistakes.

### Active Rules

- **Sheet locking must always unlock in `finally` blocks.** The job-app-chain locks Cell A1 (RED) at start and must unlock (GREEN) even on failure. Forgetting this leaves the sheet permanently locked.
- **Gemini tool compatibility**: Gemini does not support batch tool schemas well. Avoid batch-style tools; prefer individual atomic tools. (Learned from budget-agent patch.)
- **Token 0 for agents**: All agents use `temperature=0` for deterministic outputs.
- **No AgentExecutor**: LangChain v1 deprecated it. Use `create_agent` or LangGraph `StateGraph`.
- **LangGraph Dev Server for agent serving**: Each agent is served via `langgraph dev` (or `langgraph up`) which gives standardized `/invoke`, `/stream`, `/playground` endpoints and SSE streaming out of the box. The dashboard communicates with agents via these HTTP endpoints. Ports: gmail=8001, calendar=8002, budget=8003, dashboard=8080.
- **ID discovery before action**: Always fetch IDs before acting on entities — never assume IDs.
- **Secrets management**: Use `secrets/` directory in project root. Agents should check `../secrets/` when running from their subdirectories or `secrets/` if running from root.
- **MetricsCallback works in REPL mode only**: Callbacks are Python objects and cannot be serialized over HTTP. When agents run via `langgraph up`, SQLite metrics are not captured via MetricsCallback. LangSmith (when `LANGSMITH_TRACING=true`) handles server-mode traces automatically at the environment level.
- **Dashboard is Next.js 16 at port 3000** (not 8080 any more). API server is at port 8080. Do not confuse the two.
- **State DB at `data/state.db`**: SQLite file for HITL inbox, HOTL logs, run records, schedules, council contracts. Schema defined in `shared/db.py`. Never delete this file without warning.
- **HITL protocol**: Agent calls `POST /hitl` to create pending item → polls `GET /hitl/{id}` until resolved → dashboard shows approve/reject UI → resolution stored in DB.
- **HOTL logging**: After each run, agent calls `POST /hotl` with structured summary `{tools:[{name,params,result}], thoughts:[], overview}`. Dashboard shows read/unread in `/hotl` feed.
- **MEMORY.md + RULES.md per agent**: Each agent directory has these files. Agent writes to them during runs. Dashboard shows read-only via `/api/memory/{name}`. Never overwrite these files with agent-unrelated content.
- **APScheduler in api_server.py**: Reads `schedules` table on startup. Dashboard `/schedules` page edits cron via `POST /api/schedules` → hot-reloads APScheduler. No restart needed.
- **Agent Council at `/council`**: A2A coordination page with round-table SVG, contracts, and broadcast chat. Contracts stored in `council_contracts` table.
- **Per-agent accent colors**: gmail=#00ff88, calendar=#00d4ff, budget=#a855f7, job-chain=#f59e0b. Always use these consistently in new UI.


### How to Add a Rule
When you fix a non-obvious bug, make an architectural decision with lasting implications, or Jimmy says "add this to rules" — append a bullet here with a short explanation of *why* the rule exists.
