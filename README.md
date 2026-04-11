# jimmys-agents

Personal multi-agent automation system. Next.js dashboard for monitoring and chatting with agents. Agents run locally via LangGraph.

---

## Agents

| Agent | Port | Description |
|---|---|---|
| _template | 8000 | template tavily search agent with researcher sub-agent and langsmith tracing.
| gmail-agent | 8001 | Proactive inbox manager — clears junk, surfaces important emails, drafts replies |
| calendar-agent | 8002 | Calendar management — review and schedule the week |
| budget-deepagent | 8003 | Financial advisor — budgets, spending tracking, goal analysis |

---

## Adding a New Agent

1. `cp -r agents/_template agents/{name}`
2. Edit `agents/{name}/agent.py` and `skills/`
3. Add entry to `agents.yaml`
4. Add entry to `frontend/src/lib/agents.ts`
5. Add `run-{name}` target to `Makefile`
