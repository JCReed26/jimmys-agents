# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Vision

**jimmys-agents** is a personal multi-agent automation system. Agents are standalone LangGraph services. A Next.js dashboard (`frontend/`) shows agent status and provides a native deepagents chat interface for each agent.

**James builds agents. Claude handles system and orchestration.**

Architecture principles: **simple, minimal, solo-dev DX first**. No overengineering.

---

## Ports

| Service | Port |
|---|---|
| Next.js frontend (`frontend/`) | 3000 |
| template-agent | 8000 |
| gmail-agent | 8001 |
| calendar-agent | 8002 |
| budget-deepagent | 8003 |

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
│   └── calendar-agent/         # Active
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
- **LLM**: Gemini 2.5 Flash via OpenRouter (`backend/models.py`, `temperature=0`)
- **Make** — local process management
- **Next.js 16** — frontend dashboard (App Router, TypeScript, shadcn/ui, Tailwind v4)
- **useStream** — chat UI from `@langchain/langgraph-sdk/react` (CopilotKit removed April 2026)
- **Google APIs** — Sheets, Gmail, Calendar, Drive (OAuth2)
- **LangSmith** — always on when `LANGSMITH_TRACING=true`

---

## Development Commands

```bash
make install          # Install all deps (Python + npm) — uses Python 3.13
make start-all        # Start all services in background, logs in logs/
make stop-all         # Stop all background services

make run-frontend     # Next.js on :3000
make run-template     # template-agent on :8000
make run-gmail        # gmail-agent on :8001
make run-calendar     # calendar-agent on :8002
make run-budget       # budget-deepagent on :8003
```

**Adding a new agent**:
1. `cp -r agents/_template agents/{name}`
2. Edit `agent.py`, `skills/`, update `_AGENT_NAME`
3. Add entry to `agents.yaml`
4. Add entry to `frontend/src/lib/agents.ts` (copy template-agent pattern)
5. Add `run-{name}` target to `Makefile`
6. Set `NEXT_PUBLIC_{NAME}_AGENT_URL` in `frontend/.env.local`

---

## deepagents Pattern (reference: `agents/_template/`)

All agents use `create_deep_agent`. Do NOT use `AgentExecutor` or `create_agent`.

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware.subagents import SubAgent

researcher: SubAgent = {
    "name": "researcher",
    "description": "...",
    "system_prompt": "...",
    "tools": [tool1, tool2],
}

agent = create_deep_agent(
    model=llm,
    tools=[...],
    system_prompt="...",
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    subagents=[researcher],
    backend=FilesystemBackend(root_dir=Path(__file__).parent.absolute()),
    name="agent-name",
)
```

Each agent dir has:
- `agent.py` — agent definition (~100 lines)
- `tools.py` — tool definitions
- `langgraph.json` — `{"graphs": {"agent": "./agent.py:agent"}, "env": "../../.env"}`
- `skills/` — SKILL.md files + AGENTS.md memory

---

## Frontend API Routes (active)

| Route | Purpose |
|---|---|
| `GET /api/agents` | Live agent status — polls `GET :{port}/ok` |
| `GET /api/agents-md/[name]` | Read agent's AGENTS.md from filesystem |
| `GET /api/health` | Health check summary |

---

## Context Retrieval Hooks

| Working on | Read first |
|---|---|
| Any frontend file | `docs/how-it-works/frontend.md` |
| Building or modifying an agent | `docs/deepagents.md` + `agents/_template/` |
| Bugs, open issues | `docs/issues.md` |
| System state / ports / env vars | `docs/system-truth.md` |
| Deployment | `docs/how-it-works/deployment.md` |

---

## Active Rules

- **`langgraph.json` must declare `"env": "../../.env"`**: Without it the server process never sees `LANGSMITH_TRACING` and traces are silently dropped. `load_dotenv()` in `agent.py` fires too late — LangSmith client is already initialized by then.
- **Health endpoint is `/ok`**: `GET :{port}/ok` → `{"ok":true}`. Not `/health`, not `/runs/stream/health`.
- **deepagents==0.4.7 API**: No `state_schema`, no `permissions` params on `create_deep_agent`. `SubAgent` is a TypedDict — pass as list.
- **TodoListMiddleware is built-in**: `todos` appears in `stream.values.todos` automatically. No custom state schema needed.
- **useStream `filterSubagentMessages` is untyped**: Use `as any` on the options object — the option exists at runtime but is missing from generic `UseStreamOptions` TypeScript types.
- **`recursion_limit` is snake_case**: In `@langchain/langgraph-sdk` `Config` type. Not `recursionLimit`.
- **`threadId = null` for new threads**: Pass `null` to `useStream` — it creates the thread on first submit and fires `onThreadId`. Pre-generating a UUID causes a 404 on `fetchStateHistory`.
- **No icon imports in API routes**: Importing lucide-react in `/api/agents/route.ts` caused Turbopack to recompile the full icon tree on every health poll. Keep API routes free of UI imports.
- **graphId must be "agent"**: Every agent's `langgraph.json` declares `{"graphs": {"agent": "./agent.py:agent"}}`. The `graphId` in `agents.ts` must match.
- **`--no-browser` on langgraph dev**: Always use `--no-browser` in Makefile targets.
- **Models via `backend/models.py`**: Import `gemini_flash_model` — don't instantiate LLM clients directly.
- **temperature=0**: All agents use deterministic outputs.
- **Gemini tool compatibility**: Avoid batch tool schemas. Use individual atomic tools only.
- **Secrets in `secrets/`**: Agents look for `../../secrets/` (two levels up from `agents/{name}/`).
- **Sheet locking in finally**: Any agent locking a Google Sheet cell must unlock in a `finally` block.
- **Auth is Supabase (email OTP)**: Frontend requires `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **docs/issues.md is the living issue tracker**: Update it when bugs are fixed or new issues are found.
- **docs/changelog.md is the project timeline**: Add an entry whenever a meaningful phase of work completes.

---

## How to Add a Rule
When you fix a non-obvious bug, make an architectural decision, or Jimmy says "add this to rules" — append a bullet to Active Rules above with a short explanation of *why* the rule exists.
