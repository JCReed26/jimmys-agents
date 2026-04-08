# jimmys-agents

Personal multi-agent automation system. Next.js dashboard for monitoring and chatting with agents. Agents run locally via LangGraph.

---

## Agents

| Agent | Port | Description |
|---|---|---|
| gmail-agent | 8001 | Proactive inbox manager — clears junk, surfaces important emails, drafts replies |
| calendar-agent | 8002 | Calendar management — review and schedule the week |
| budget-deepagent | 8003 | Financial advisor — budgets, spending tracking, goal analysis |
| job-search-agent | 8005 | Job hunter — scrapes, classifies, drafts applications, tracks pipeline |

---

## Dev

```bash
make install          # Install Python + npm deps
make run-frontend     # Next.js dashboard on :3000
make run-gmail        # gmail-agent on :8001
make run-calendar     # calendar-agent on :8002
make run-budget       # budget-deepagent on :8003
make run-job-search   # job-search-agent on :8005
make start-all        # All services in background (logs in logs/)
make stop-all         # Stop all background services
```

---

## Adding a New Agent

1. `cp -r agents/_template agents/{name}`
2. Edit `agents/{name}/agent.py` and `skills/`
3. Add entry to `agents.yaml`
4. Add entry to `frontend/src/lib/agents.ts`
5. Add `run-{name}` target to `Makefile`

---

## WIP / Planned

- gmail + calendar harness upgrades
- managing-assistant (A2A orchestration)
- news agent
- prediction market agent
- lead generation agent
- telegram bridge for remote agent chat
