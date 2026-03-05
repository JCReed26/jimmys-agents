# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Vision

**jimmys-agents** is a personal multi-agent automation system. Each agent is a standalone service running in Docker. A lightweight FastAPI + HTMX frontend monitors all agents, shows stats, and surfaces HITL (Human-in-the-Loop) inboxes for approve/reject decisions. The system runs locally on a Mac (primary dev machine) and optionally on a Windows PC with GPU for local model inference.

Architecture principles: **simple, minimal, solo-dev DX first**. No overengineering.

---

## Tech Stack

- **Python 3.13** — all agents
- **LangChain v1** (`langchain>=1.0`) — use `from langchain.agents import create_agent` (NOT the deprecated `langgraph.prebuilt.create_react_agent`)
- **LangGraph** — for multi-node graph workflows (job-app-chain pattern)
- **LLM**: Gemini 2.5 Flash via `langchain-google-genai` (`temperature=0`)
- **Docker + docker-compose** — one service per agent, managed from root `docker-compose.yml`
- **FastAPI + HTMX** — monitoring frontend (another docker-compose service)
- **Google APIs** — Sheets, Gmail, Calendar, Drive (OAuth2)

---

## Repository Structure

```
jimmys-agents/
├── docker-compose.yml          # All services: agents + frontend
├── frontend/                   # FastAPI + HTMX monitoring dashboard
│   ├── main.py
│   ├── Dockerfile
│   └── templates/
├── gmail-agent/                # Polls inbox every 30 min, classifies emails
├── calendar-agent/             # Google Calendar CRUD
├── ticktick-agent/             # TickTick task management
├── budget-agent/               # Google Sheets budget tracking
├── job-app-chain/              # LangGraph workflow: scrape → classify → apply
│   ├── CLAUDE.md               # Job-app-chain-specific specs
│   ├── state.py
│   ├── graph.py
│   └── nodes/
└── shared/                     # Shared utilities (auth helpers, sheet client, etc.)
```

Each agent directory contains its own `Dockerfile` and `requirements.txt`.

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

## Docker Architecture

Root `docker-compose.yml` defines all services. Each agent is its own service with its own `Dockerfile`.

```bash
# Run everything
docker-compose up -d

# Run a single agent
docker-compose up gmail-agent

# View logs for one agent
docker-compose logs -f budget-agent

# Rebuild after code change
docker-compose up --build gmail-agent

# Stop everything
docker-compose down
```

**Adding a new agent**: create `agent-name/` directory with `Dockerfile`, `requirements.txt`, and agent code, then add a service block to `docker-compose.yml`. That's it.

**Removing an agent**: delete the directory, remove the service from `docker-compose.yml`.

---

## Deployment (Mac → Windows GPU Machine)

1. On push to `main`, GitHub Actions builds images and pushes to GitHub Container Registry (GHCR).
2. On the Windows PC, run to pull and restart:
   ```powershell
   docker-compose pull && docker-compose up -d
   ```
3. Windows PC is used for GPU-based local model inference (ollama or similar). Agents can point to it via `OLLAMA_BASE_URL` env var.

---

## Monitoring Frontend

FastAPI + HTMX dashboard at `http://localhost:8080`:
- **Agent status**: running/stopped, last run time, error count
- **HITL inboxes**: approve/reject buttons for items requiring human decision (e.g. job-app-chain job approvals)
- **Logs**: per-agent log streaming

Agents expose a simple internal API (or write to a shared state file/DB) that the frontend reads. Keep it simple — SQLite or JSON files are fine for state sharing between agent and frontend.

---

## Authentication

- **Google APIs**: OAuth2 via `credentials.json`. Each agent gets its own token file (`token.json`, `sheets_token.json`, etc.). Mount these via Docker volumes — never bake into images.
- **TickTick**: OAuth2 via `.token-oauth`. Same volume mount pattern.
- **Env vars**: `.env` at project root, loaded in docker-compose via `env_file: .env`.
- **Never commit**: `credentials.json`, `*.json` token files, `.env`.

---

## Agent Patterns

**Polling agent** (gmail-agent): infinite loop with sleep, try/except for graceful shutdown.

**Interactive agent** (calendar, ticktick, budget): REPL loop with streaming responses, `InMemorySaver` checkpointer for multi-turn context.

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
- **LangGraph Dev Server for agent serving**: Each agent is served via `langgraph dev` (or `langgraph up`) which gives standardized `/invoke`, `/stream`, `/playground` endpoints and SSE streaming out of the box. The dashboard communicates with agents via these HTTP endpoints. Ports: gmail=8001, calendar=8002, budget=8003, ticktick=8004, dashboard=8080.
- **ID discovery before action**: Agents (especially TickTick) must fetch IDs before acting on entities — never assume IDs.
- **Volume-mount credentials**: Never bake OAuth tokens or `credentials.json` into Docker images. Always use volume mounts.
- **Agent Dockerfiles use repo root as build context**: Each agent Dockerfile copies `shared/` explicitly. Build context in docker-compose is always `.` (repo root) with `dockerfile: <agent>/Dockerfile`. Never use the agent subdirectory as the build context.
- **MetricsCallback works in REPL mode only**: Callbacks are Python objects and cannot be serialized over HTTP. When agents run via `langgraph up`, SQLite metrics are not captured via MetricsCallback. LangSmith (when `LANGSMITH_TRACING=true`) handles server-mode traces automatically at the environment level.

- **ticktick-agent secrets mount must be read-write**: Unlike other agents, ticktick-agent writes its OAuth token via `_save_token` in `ticktick_client.py`. Mount `secrets/` as `rw` (not `:ro`) in docker-compose for this agent.

### How to Add a Rule
When you fix a non-obvious bug, make an architectural decision with lasting implications, or Jimmy says "add this to rules" — append a bullet here with a short explanation of *why* the rule exists.
