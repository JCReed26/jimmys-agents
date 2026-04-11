# System Truth
> Last updated: 2026-04-11. Read this before touching anything.

## Active Agents

| Agent | Port | Status | Pattern |
|---|---|---|---|
| template-agent | 8000 | ✅ Local | deepagents + langgraph dev |
| gmail-agent | 8001 | ⚠️ Local only | deepagents + langgraph dev |
| calendar-agent | 8002 | ⚠️ Local only | deepagents + langgraph dev |
| budget-agent | 8003 | ⚠️ Local only | deepagents + langgraph dev |

## Frontend
- URL: http://localhost:3000
- Framework: Next.js 16, App Router, TypeScript, shadcn/ui, Tailwind v4
- Chat: `useStream` from `@langchain/langgraph-sdk/react` (no CopilotKit — removed April 2026)
- Dynamic route: `/agent/[name]` — reads from `src/lib/agents.ts`
- Thread history sidebar (replaces AGENTS.md sidebar)
- Build time: ~14s (was ~2min with CopilotKit)

## LangSmith
- Project: `jimmys-agents`
- Tracing: always on (`LANGSMITH_TRACING=true` in `.env`)
- **CRITICAL**: `langgraph.json` must have `"env": "../../.env"` — without it the server process never sees `LANGSMITH_TRACING` and traces are silently dropped.

## Health Checks
- All agents: `GET http://localhost:{port}/ok` → `{"ok":true}`
- Dashboard polls every 30s

## Required Env Vars
```
OPENROUTER_API_KEY        # LLM via OpenRouter
TAVILY_API_KEY            # Template agent web search
LANGSMITH_API_KEY         # Tracing
LANGSMITH_TRACING=true
LANGSMITH_PROJECT=jimmys-agents
NEXT_PUBLIC_TEMPLATE_AGENT_URL=http://localhost:8000
NEXT_PUBLIC_GMAIL_AGENT_URL=http://localhost:8001
NEXT_PUBLIC_CALENDAR_AGENT_URL=http://localhost:8002
NEXT_PUBLIC_BUDGET_AGENT_URL=http://localhost:8003
```

## Known Issues / Notes
- `deepagents==0.4.7`: no `state_schema`, no `permissions` params on `create_deep_agent`
- `SubAgent` is a TypedDict — pass as list: `subagents=[researcher, summarizer]`
- `TodoListMiddleware` is built into deepagents — `stream.values.todos` populated automatically
- `useStream` `filterSubagentMessages` option is untyped for generic agents — use `as any` on the options object (known SDK gap, works at runtime)
- `recursion_limit` is snake_case in `@langchain/langgraph-sdk` `Config` type
