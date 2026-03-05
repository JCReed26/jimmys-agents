# Dashboard + Infrastructure Design
**Date:** 2026-03-04
**Branch:** job-app-chain
**Status:** Approved — ready for implementation

---

## Overview

Full infrastructure overhaul of `jimmys-agents`: introduce `a-dashboard` (FastAPI + Vanilla JS) as the primary monitoring and chat interface, clean up file structure, add per-agent Dockerfiles and pinned `requirements.txt`, secure credential handling via volume-mounted `secrets/`, and implement a dual-layer metrics system (SQLite primary, LangSmith optional).

**Constraints:**
- `job-app-chain/` is untouched during this task
- Solo-dev DX first — no overengineering
- SQLite is the source of truth; LangSmith is opt-in via `LANGSMITH_API_KEY`

---

## 1. File Structure

```
jimmys-agents/
├── a-dashboard/                  # sorts to top; FastAPI + Vanilla JS
│   ├── main.py                   # FastAPI app
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── db.py                     # SQLite read layer
│   ├── static/
│   │   ├── css/main.css          # JetBrains Mono, dark terminal theme
│   │   └── js/
│   │       ├── agent-card.js     # Web Component
│   │       ├── agent-detail.js   # Web Component (split view)
│   │       └── chat-panel.js     # Web Component (SSE streaming)
│   └── templates/
│       ├── index.html            # Main dashboard
│       ├── agent.html            # Agent detail (left stats + right chat)
│       └── inbox.html            # Global HITL inbox
│
├── budget-agent/
│   ├── budget-agent.py
│   ├── langgraph.json
│   ├── Dockerfile
│   └── requirements.txt
│
├── calendar-agent/               # same pattern as budget-agent
├── gmail-agent/                  # same pattern
├── ticktick-agent/               # same pattern
├── job-app-chain/                # UNTOUCHED
│
├── shared/
│   ├── auth.py                   # Google OAuth helper (extracted from 3 agents)
│   └── metrics_callback.py      # LangChain BaseCallbackHandler → SQLite + LangSmith
│
├── secrets/                      # gitignored, Docker volume-mounted read-only
│   ├── credentials.json
│   ├── token.json
│   ├── calendar_token.json
│   ├── sheets_token.json
│   └── .token-oauth
│
├── data/                         # gitignored, Docker volume-mounted
│   ├── metrics.db                # SQLite: all agent run metrics
│   └── budget_state.json
│
├── docker-compose.yml
├── .env
└── CLAUDE.md
```

**Cleanup moves:**
- All token/credential files → `secrets/` (volume-mounted, gitignored, never baked into images)
- `budget_state.json` → `data/`
- Shared Google OAuth code extracted from calendar-agent and budget-agent → `shared/auth.py`
- Root-level catch-all `requirements.txt` → removed; each agent has its own pinned version

---

## 2. Agent Serving — LangGraph Dev Server

Each agent is served by `langgraph up` which provides:
- `GET  /ok` — health check
- `POST /invoke` — single request/response
- `POST /stream` — SSE streaming
- `GET  /playground` — built-in UI

**Ports:**
| Service        | Port |
|----------------|------|
| gmail-agent    | 8001 |
| calendar-agent | 8002 |
| budget-agent   | 8003 |
| ticktick-agent | 8004 |
| a-dashboard    | 8080 |

**Per-agent `langgraph.json`:**
```json
{
  "dependencies": ["."],
  "graphs": {
    "agent": "./agent-file.py:graph_or_agent_var"
  }
}
```

**Dockerfile pattern (all agents):**
```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["langgraph", "up", "--host", "0.0.0.0", "--port", "8000"]
```

**docker-compose.yml pattern:**
```yaml
gmail-agent:
  build: ./gmail-agent
  ports: ["8001:8000"]
  env_file: .env
  volumes:
    - ./secrets:/app/secrets:ro
    - ./data:/app/data

a-dashboard:
  build: ./a-dashboard
  ports: ["8080:8080"]
  env_file: .env
  volumes:
    - ./data:/app/data:ro
  # no depends_on — starts regardless, agents show as DOWN if unreachable
```

---

## 3. Metrics System

**Primary: SQLite** (`data/metrics.db`)

```sql
CREATE TABLE agent_runs (
  id                TEXT PRIMARY KEY,   -- uuid
  agent_name        TEXT NOT NULL,
  started_at        INTEGER NOT NULL,   -- unix ms
  ended_at          INTEGER,
  duration_ms       INTEGER,
  llm_calls         INTEGER DEFAULT 0,
  tool_calls        TEXT,               -- JSON: [{name, duration_ms, success, output_len}]
  total_tokens      INTEGER,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  error             TEXT,               -- null = success
  langsmith_run_id  TEXT                -- optional deep trace link
);
```

**Optional: LangSmith**
Enabled automatically when `LANGSMITH_API_KEY` is present in `.env`. The dashboard never requires it — all cards and charts read from SQLite only.

**`shared/metrics_callback.py`** — a `BaseCallbackHandler` that:
- `on_llm_start` → record start time
- `on_llm_end` → record tokens, duration, write to SQLite
- `on_tool_start` → record tool name + start time
- `on_tool_end` → record tool duration + success, append to run's tool_calls JSON
- `on_chain_error` → write error field

All agents add this callback when initializing their LLM.

**AI engineering metrics surfaced on dashboard:**
- Avg latency / P95 latency per agent
- Success rate (% runs without error)
- Top tools by call frequency + avg duration
- Token burn rate (prompt vs completion)
- Run history table with LangSmith trace link (when available)

---

## 4. Dashboard UI

**Stack:** FastAPI + Jinja2 templates + Vanilla JS Web Components + SSE streaming
**Font:** JetBrains Mono (Google Fonts)
**Theme:** Dark terminal/hacker with premium feel — zinc/slate backgrounds, green/cyan status indicators, violet accents for interactive elements

### Page 1 — Main Dashboard `/`

Grid of agent cards. Each card shows:
- Agent name, status badge (RUNNING / IDLE / DOWN / ERROR)
- Avg latency, tool call count, success rate
- HITL pending count badge (clickable → inbox)
- **job-app-chain exception:** shows `job_inbox` count + `optimized_jobs` count (read from Google Sheets API), no HITL queue

### Page 2 — Agent Detail `/agent/{name}`

Split view:
- **Left panel:** status, uptime, last run, metrics (avg/p95 latency, tokens/run, success rate), top tools table, HITL inbox with approve/reject buttons
- **Right panel:** streaming chat connected to agent's `/stream` endpoint via SSE
- **job-app-chain exception:** left panel shows sheet metrics only, no HITL inbox, no chat (sheet-managed)

### Page 3 — Global Inbox `/inbox`

Flat list of all pending HITL items across all eligible agents (excludes job-app-chain). Grouped by agent. Inline approve/reject.

---

## 5. Security

- `secrets/` directory is gitignored and Docker volume-mounted read-only (`:ro`)
- `.env` loaded via `env_file` in docker-compose — never baked into images
- `LANGSMITH_API_KEY` optional — app degrades gracefully without it
- No credentials printed to logs

---

## 6. Per-Agent `requirements.txt` (pinned)

Each agent only includes what it needs. Example for gmail-agent:
```
langchain>=1.0
langgraph>=0.2
langgraph-cli[inmem]>=0.1
langchain-google-genai>=2.0
langchain-google-community>=2.0
google-auth-oauthlib>=1.2
python-dotenv>=1.0
langsmith>=0.1
```

Root-level `requirements.txt` is removed.
