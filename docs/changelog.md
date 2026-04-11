# Project Changelog

A human-readable timeline of what happened and why. Not a commit log — a story.

---

## April 2026 — Foundation Rebuild

**The problem:** CopilotKit was causing ~2-minute frontend compile times and was the wrong abstraction for the deepagents streaming model. The template agent was a hello-world stub. There was no reliable way to verify the full stack worked end-to-end.

**What was done:**

The entire frontend chat system was ripped out and rebuilt. CopilotKit and the AG-UI client were removed. In their place, `useStream` from `@langchain/langgraph-sdk/react` was wired directly to each agent — no proxy, no intermediate runtime. Build time dropped from ~2 minutes to ~14 seconds.

The template agent (`agents/_template/`) was upgraded into a full reference implementation. It now has Tavily web search, a researcher subagent and a summarizer subagent, and a todo list that streams live to the frontend as the agent works. The pattern in `_template/` is the canonical blueprint — every future agent starts as a copy of it.

A thread history sidebar replaced the AGENTS.md panel on the chat page. It pulls live thread history from the LangGraph server using the SDK client and shows the first message of each conversation as the thread title.

Several bugs were found and fixed during this work: LangSmith traces were silently dropped because `langgraph dev` initializes the LangSmith client before `agent.py` loads `.env` — fixed by adding `"env": "../../.env"` to every agent's `langgraph.json`. The health check endpoint was wrong (`/runs/stream/health` → `/ok`). The dashboard was hammering Turbopack with 8-second polls that caused recompiles because the health route imported lucide icons.

The job-search-agent was removed. Career Ops replaces that function.

**State at end of phase:**
- Template agent: running locally, LangSmith traces confirmed
- Frontend: useStream chat, thread history sidebar, todo list, subagent cards
- Other agents (gmail, calendar, budget): untouched, still running on old pattern — next phase

---

_Add an entry here whenever a meaningful phase of work completes._
