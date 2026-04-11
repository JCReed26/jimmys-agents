# System Rebuild Design — 2026-04-10

## Context

The frontend has grown unstable due to CopilotKit — near 2-minute compile times, heavyweight runtime, wrong abstraction for deepagents. The template agent is a stub (`hello_world` only). There is no reliable integration test to verify that agent → streaming → frontend → LangSmith all work together.

This rebuild establishes the foundation the rest of the system depends on:
- Remove CopilotKit entirely, replace with `useStream` from `@langchain/react` (native deepagents frontend)
- Upgrade the template agent to a full reference implementation (Tavily search, subagents, todos, memory)
- Deploy template agent to LangSmith cloud, verify locally first
- Playwright integration test confirms the full stack: agent → stream → todo list → subagent cards → LangSmith trace

No commits until Playwright confirms the stack is green.

---

## Approved Architecture

**Agent runtime:** LangSmith cloud deployment (`langgraph deploy`) with local dev via `langgraph dev --no-browser`  
**Frontend chat:** `useStream()` from `@langchain/react` — direct to agent URL, no intermediate API route  
**Agent pages:** Dynamic route `/agent/[name]` (existing pattern, keep it)  
**Scheduling:** LangSmith crons via `client.crons.create()` (future — not in this phase)  
**Tracing:** LangSmith, `LANGSMITH_TRACING=true` in `.env` (already wired)

---

## Critical Files

| File | Action |
|---|---|
| `agents/_template/agent.py` | Full rewrite — todos state, subagents, CompositeBackend, Tavily tools, middleware |
| `agents/_template/tools.py` | Create — Tavily search + fetch_url tool definitions |
| `Makefile` | Add `run-template` target (port 8000), remove `run-job-search` |
| `agents.yaml` | Add template-agent entry (port 8000), remove job-search-agent |
| `frontend/package.json` | Remove 3 CopilotKit + `@ag-ui/client` packages, add `@langchain/react` |
| `frontend/src/app/api/copilotkit/route.ts` | Delete entirely |
| `frontend/src/lib/agents.ts` | Add template-agent, remove job-search-agent, add `langsmithUrl` field |
| `frontend/src/app/agent/[name]/page.tsx` | Replace CopilotKit with `useStream` — keep header + memory sidebar |
| `frontend/src/components/TodoList.tsx` | Create — reads `stream.values.todos` |
| `frontend/src/components/SubagentCard.tsx` | Create — reads `stream.getSubagentsByMessage()` |
| `.env.example` | Add `TAVILY_API_KEY`, remove job-search vars, clean up stale entries |
| `docs/system-truth.md` | Create — source of truth for current system state |
| `docs/agent-contracts/template-agent.md` | Create — tools, skills, env vars, LangSmith assistant ID |
| `docs/how-it-works/deployment.md` | Create — local dev → LangSmith deploy flow + integration checklist |
| `CLAUDE.md` | Update — remove CopilotKit rule, add template-agent, add `run-template` port |

---

## Phase 1 — Template Agent Upgrade

### `agents/_template/agent.py` rewrite

```python
from typing import Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages
from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, StateBackend, StoreBackend
from deepagents.permissions import FilesystemPermission
from deepagents.middleware import ModelCallLimitMiddleware
from backend.models import gemini_flash_model as llm
from .tools import tavily_search, fetch_url

_AGENT_NAME = "template-agent"

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    todos: list[dict]   # {content: str, status: "pending"|"in_progress"|"completed"}

SYSTEM_PROMPT = """You are a research assistant. When given a task:
1. Break it into todos immediately (update the todos state).
2. Use the researcher subagent for deep web research.
3. Use the summarizer subagent to condense findings.
4. Report results clearly.

Always update todo status as you progress."""

subagents = {
    "researcher": {
        "name": "researcher",
        "description": "Performs focused web research on a specific topic using Tavily search",
        "system_prompt": "You are a research specialist. Search thoroughly, return structured findings.",
        "tools": [tavily_search, fetch_url],
    },
    "summarizer": {
        "name": "summarizer",
        "description": "Condenses research findings into clear structured output",
        "system_prompt": "You are a synthesis expert. Take research and produce clear, concise summaries.",
        "tools": [],
    },
}

backend = CompositeBackend(
    default=StateBackend(),
    routes={
        "/memories/": StoreBackend(
            namespace=lambda rt: (rt.server_info.assistant_id,)
        )
    },
)

permissions = [
    FilesystemPermission(operations=["read", "write"], paths=["/workspace/**"], mode="allow"),
    FilesystemPermission(operations=["write"], paths=["/workspace/skills/**"], mode="deny"),
]

agent = create_deep_agent(
    model=llm,
    tools=[tavily_search, fetch_url],
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    subagents=subagents,
    backend=backend,
    permissions=permissions,
    middleware=[ModelCallLimitMiddleware(run_limit=50)],
    name=_AGENT_NAME,
    state_schema=AgentState,
)
```

### `agents/_template/tools.py` (new file)

```python
import os
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.tools import tool
import httpx

tavily_search = TavilySearchResults(
    max_results=5,
    api_key=os.environ.get("TAVILY_API_KEY"),
)

@tool
def fetch_url(url: str) -> str:
    """Fetch the text content of a URL."""
    r = httpx.get(url, timeout=10, follow_redirects=True)
    r.raise_for_status()
    return r.text[:8000]  # cap to avoid context blowout
```

### Makefile additions

```makefile
run-template:
    cd agents/_template && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port 8000 --no-browser
```

Remove `run-job-search` target and all job-search entries from `start-all` / `stop-all`.

### `agents.yaml` change

Add:
```yaml
template-agent:
  port: 8000
  dir: agents/_template
  enabled: true
  rate_limit: "20/minute"
```

Remove `job-search-agent` entry.

---

## Phase 2 — Frontend CopilotKit Removal

### Package changes

Remove from `package.json`:
- `@copilotkit/react-core`
- `@copilotkit/react-ui`  
- `@copilotkit/runtime`
- `@ag-ui/client`

Add:
- `@langchain/react`

> **Verify before implementing:** Confirm `useStream` ships in `@langchain/react` and is compatible with `@langchain/langgraph-sdk@^1.6.5` already installed. Check npm registry. If `useStream` is in `@langchain/langgraph-sdk`, import from there instead.

### Delete

`frontend/src/app/api/copilotkit/route.ts` — entire file gone.

### `frontend/src/lib/agents.ts` changes

1. Remove `job-search-agent` entry
2. Add template-agent:
```typescript
"template-agent": {
  name: "template-agent",
  displayName: "Template",
  url: process.env.NEXT_PUBLIC_TEMPLATE_AGENT_URL ?? "http://localhost:8000",
  langsmithUrl: process.env.NEXT_PUBLIC_TEMPLATE_LANGSMITH_URL ?? "",
  port: 8000,
  graphId: "agent",
  icon: Zap,
  description: "Reference agent — Tavily search, subagents, todo list, full deepagents pattern",
  accentColor: "#6366f1",
  accentColorRgb: "99,102,241",
  type: "agent",
},
```
3. Add `langsmithUrl: string` to `AgentConfig` interface (empty string = use local url)
4. Update `url` on all agents to use env var with localhost fallback

### `frontend/src/app/agent/[name]/page.tsx` changes

**Keep:** Header (icon, name, description, port badge, new-thread button, sidebar toggle), memory sidebar, overall layout.

**Replace:** `<CopilotKit>` wrapper + `<CopilotChat>` with `useStream` pattern:

```tsx
// Replace CopilotKit imports with:
import { useStream } from "@langchain/react";

// Replace the CopilotKit wrapper + CopilotChat with:
function AgentHarness({ agentName, cfg }) {
  const stream = useStream({
    apiUrl: cfg.url,
    assistantId: cfg.graphId,   // "agent"
    reconnectOnMount: true,
    fetchStateHistory: true,
    filterSubagentMessages: true,
  });

  const todos = stream.values?.todos ?? [];

  // Render: message list + TodoList + SubagentCard per message + input bar
  // Keep existing header and memory sidebar unchanged
}
```

Remove CSS import: `import "@copilotkit/react-ui/styles.css";`

### New components

**`frontend/src/components/TodoList.tsx`**
- Props: `todos: Array<{content: string, status: "pending"|"in_progress"|"completed"}>`
- Renders: progress bar (% complete) + list of items with status icons
- Gray hollow circle = pending, amber pulse = in_progress, green check = completed
- Collapses completed items when count > 5

**`frontend/src/components/SubagentCard.tsx`**
- Props: `subagents` from `stream.getSubagentsByMessage(msg.id)`
- Each card: subagent name, status badge, collapsible streaming messages
- Auto-collapse on complete, show progress bar while running

### `.env.local` additions (frontend)

```
NEXT_PUBLIC_TEMPLATE_AGENT_URL=http://localhost:8000
NEXT_PUBLIC_TEMPLATE_LANGSMITH_URL=  # filled after LangSmith deploy
```

---

## Phase 3 — LangSmith Deployment

### Prerequisites (verify via Chrome/Playwright)
1. Navigate to smith.langchain.com — confirm logged in as correct account
2. Verify `LANGSMITH_API_KEY` in `.env` matches the account
3. Confirm project `jimmys-agents` exists under the correct org

### Deploy flow
```bash
# From agents/_template/
langgraph deploy
# OR if deepagents CLI:
deepagents deploy
```

LangSmith will provision an assistant. Copy the deployment URL.

### After deploy
1. Update `NEXT_PUBLIC_TEMPLATE_LANGSMITH_URL` in `frontend/.env.local`
2. Update `agents.ts` logic: if `langsmithUrl` is set, use it; else fall back to localhost `url`
3. Restart frontend — page should now stream from LangSmith

---

## Phase 4 — Playwright Integration Test

Playwright test lives at `tests/integration/test_template_agent.py` (or `.spec.ts` if TS test runner preferred — default to Python since that's the existing test setup).

### Test sequence

```
1. assert template agent health: GET http://localhost:8000/runs/stream/health → 200
2. open browser → http://localhost:3000/agent/template-agent
3. assert: page loads, no copilotkit errors in console
4. type message: "Research the best free note-taking apps in 2025"
5. submit
6. assert: todo list appears within 5s (at least 1 item visible)
7. assert: at least one todo transitions to "in_progress" (amber pulse)
8. assert: subagent card appears for "researcher" 
9. assert: final message rendered in chat
10. assert: all todos reach "completed" status
11. open LangSmith: smith.langchain.com/projects/jimmys-agents
    → confirm run trace exists with correct tools + token counts
```

**Failure modes to handle:**
- Agent offline → test fails fast at step 1 with clear message
- useStream connect error → console error captured, test fails with context
- Todos never appear → likely state_schema not wired; assert gives exact failure
- LangSmith trace missing → LANGSMITH_TRACING not set; checklist item

---

## Verification Before Any Commit

```
[ ] make run-template starts cleanly on :8000
[ ] GET http://localhost:8000/runs/stream/health returns 200
[ ] npm run dev compiles in < 10 seconds (no CopilotKit)
[ ] /agent/template-agent loads in browser
[ ] Sending a message streams a response
[ ] Todo list renders and updates
[ ] Subagent cards appear
[ ] AGENTS.md sidebar still shows
[ ] LangSmith trace visible at smith.langchain.com
[ ] Playwright test passes (all 11 assertions)
```

Only after all checkboxes pass → single commit with everything.

---

## Docs Created in This Phase

| File | Purpose |
|---|---|
| `docs/system-truth.md` | Current state: what's deployed, ports, LangSmith URLs, what works |
| `docs/agent-contracts/template-agent.md` | Tools, skills, env vars, LangSmith assistant ID |
| `docs/how-it-works/deployment.md` | Local dev → LangSmith deploy flow + the verification checklist above |
| `docs/how-it-works/frontend.md` | useStream patterns, env var routing local vs cloud |

---

## What's NOT in This Phase

- Gmail / calendar agent rebuild (next phase, after this stack is confirmed)
- Scheduled cron jobs (after LangSmith deploy is stable)
- Supabase auth changes (untouched)
- Budget deepagent changes (untouched, runs on uvicorn as-is)
- New agents (daily briefing, research, lead research — planned for after foundation works)

---

## Open Questions to Resolve During Implementation

1. **`useStream` package source** — verify whether it's `@langchain/react` or exported from `@langchain/langgraph-sdk` (already installed). Check npm before writing any import.
2. **`deepagents deploy` vs `langgraph deploy`** — confirm which CLI command deploys to LangSmith for this repo's setup.
3. **`StoreBackend` local dev** — confirm whether `CompositeBackend` with `StoreBackend` works with `langgraph dev` locally or only on LangSmith cloud. If local-only doesn't support it, fall back to `FilesystemBackend` for local, `CompositeBackend` only in production config.
4. **`rt.server_info`** — requires `deepagents>=0.5.0`. Verify current version in `requirements.txt`.
