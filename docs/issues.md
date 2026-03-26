# jimmys-agents — Issue Tracker

Discovered via systematic test pass on 2026-03-25. Covers API, frontend, agent integration, infrastructure, and missing features. James builds agents; the rest of this system (scheduling, logging, cost tracking, API wiring) needs to be fixed around him.

---

## Critical — Core functionality broken

### C-01: AG-UI stream endpoint protocol mismatch
**Files:** `shared/api_server.py:227`, `agents.yaml`
**Problem:** The gateway proxies `POST /agents/{name}/run` to `{agent_url}/run`, but `langgraph dev` exposes `/runs/stream` (not `/run`). The agent returns 404 which is silently swallowed — the stream hangs indefinitely with 0 bytes.
**Impact:** All scheduled run monitoring, workflow live stream, and any system that uses the AG-UI gateway endpoint is broken. Run records accumulate as `"running"` and never close.
**Fix:** Either update the gateway to proxy to `/runs/stream` and translate the LangGraph SSE format to AG-UI events, or add a real AG-UI `/run` endpoint to each agent using `ag-ui-langgraph`.

---

### C-02: Scheduled trigger calls `/invoke` — doesn't exist on langgraph dev
**File:** `shared/api_server.py:67`
```python
r = await client.post(f"{registry.base_url(agent)}/invoke", json=payload)
```
**Problem:** `langgraph dev` exposes `/runs` (blocking POST) not `/invoke`. Every scheduled trigger immediately records `status: "error"` with `404 Not Found`.
**Impact:** Scheduled runs never execute. APScheduler fires on schedule but the actual agent call fails every time.
**Fix:** Change to `POST {agent_url}/runs` with the correct LangGraph payload shape: `{"assistant_id": "agent", "input": {...}, "config": {...}}`.

---

### C-03: `BudgetSyncMiddleware.aafter_agent` crashes on every run
**File:** `budget-deepagent/agent.py:61`
**Error:** `AttributeError: 'Runtime' object has no attribute 'config'`
**Problem:** The deepagents middleware hook signature assumes `runtime.config` exists, but the LangGraph runtime object at version 0.7.66 doesn't expose it this way.
**Impact:** Every agent run fails in the `aafter_agent` phase. Consequences cascade:
- Google Sheets never gets written back (CSV → Sheets sync skipped)
- HOTL summaries are never posted to the dashboard
- LangSmith shows failed runs for every chat session
**Fix:** Update `aafter_agent` to use the correct runtime API for the installed langgraph version, or remove the `runtime.config` reference if it's not needed.

---

### C-04: `GET /api/stream/[agent]` proxies to a non-existent backend endpoint
**File:** `next-dashboard/src/app/api/stream/[agent]/route.ts:9`
```typescript
const upstream = await fetch(`${API_BASE}/sse/${agent}/live`, ...)
```
**Problem:** `GET /sse/{agent}/live` does not exist in `api_server.py`. The route returns 502 immediately.
**Impact:** The workflow live stream panel always shows "disconnected". Step nodes never animate. The AG-UI stream component is completely non-functional.
**Fix:** Either implement `GET /sse/{agent}/live` in the API server (persistent SSE pub-sub for background runs), or rewire the frontend to use a different streaming mechanism.

---

### C-05: `POST /api/hotl/clear` — Next.js route and backend endpoint both missing
**Files:** `next-dashboard/src/app/settings/page.tsx:19`, `shared/api_server.py`
**Problem:** Settings page calls `POST /api/hotl/clear` but:
1. No Next.js route file exists at `app/api/hotl/clear/route.ts`
2. No `/hotl/clear` endpoint in `api_server.py`
**Impact:** "Clear logs" button in Settings silently does nothing (fetch call swallowed by try/catch, button briefly shows "Cleared" incorrectly).
**Fix:** Add both the Next.js proxy route and the FastAPI endpoint.

---

### C-06: `make install` silently installs dependencies to Python 3.14 instead of 3.13
**File:** `Makefile:13`
```makefile
pip install -r requirements.txt
```
**Problem:** The venv contains both Python 3.13 (default `python`/`python3`) and 3.14. `pip` without a version qualifier installs to 3.14's site-packages. The API server runs under 3.13 and can't import `apscheduler`, `slowapi`, or other packages.
**Impact:** `make start-all` → API server fails immediately on startup with `ModuleNotFoundError`.
**Fix:** Change to `pip3.13 install -r requirements.txt` or pin the venv to a single Python version during `make setup`.

---

## Major — Wrong behavior, data never captured

### M-01: Chat history not persisted — sessions lost on page reload
**Files:** `next-dashboard/src/hooks/use-agent-chat.ts`, LangGraph in-memory checkpointer
**Problem:** Every page load generates a new `thread_id = thread_${Date.now()}`. LangGraph dev uses an in-memory checkpointer that doesn't survive restarts. The `GET /api/chat/[agent]` history route fetches from a non-existent backend endpoint (`GET /chat/{agent}/history`) and always returns `{ messages: [] }`.
**Impact:** Every conversation starts from scratch. There is no session continuity. Users cannot review what an agent said previously.
**Fix:** Persist thread IDs (localStorage or DB), implement `GET /chat/{agent}/history` in the API server by reading LangGraph thread state via `GET /threads/{thread_id}/state`, and switch agents to a persistent checkpointer (e.g., Postgres via `langgraph-checkpoint-postgres`).

---

### M-02: Run Logs shows no real agent sessions
**Files:** `shared/api_server.py`, `budget-deepagent/agent.py`
**Problem:** Run logs (HOTL) are only populated when agents call `POST /hotl` from their `aafter_agent` hook. Because C-03 crashes that hook on every run, no HOTL entries are ever created from real conversations. The logs page will always show empty (or only manually created test entries).
**Impact:** The entire logging system is non-functional for actual usage. There is no audit trail.
**Fix:** Fix C-03 first. Then ensure every completed chat run posts a HOTL summary including: message count, tools used, duration, and any errors.

---

### M-03: Cost tracking always $0 — token counts never captured
**Files:** `shared/api_server.py`, `shared/db.py`, `budget-deepagent/agent.py`
**Problem:** `run_records.token_count` and `cost_usd` are initialized to 0 and never updated. The LangGraph streaming response does not surface token usage in a form the current code captures. The `aafter_agent` hook (where costs could be computed) crashes before it can write anything.
**Impact:** `/observe` always shows $0.00. Cost Today on dashboard is always $0. There is no way to track spend.
**Fix:** After fixing C-03, extract token usage from the LangGraph run metadata (`usage_metadata` on the final AI message) in `aafter_agent`, then `POST /runs/{run_id}/finish` with real token and cost values. Cost can be computed from model pricing tables.

---

### M-04: LangSmith launches with `0.0.0.0` — Studio connection fails in browser
**File:** `Makefile:24,26,28,30`
```makefile
../.venv/bin/langgraph dev --host 0.0.0.0 --port 8003
```
**Problem:** `--host 0.0.0.0` makes the server bind to all interfaces (correct), but the LangSmith Studio URL it opens is `https://smith.langchain.com/studio/?baseUrl=http://0.0.0.0:8003`. Browsers block connections to `0.0.0.0`. Studio can't connect.
**Impact:** LangSmith playground is unreachable. Can't use the visual debugger for agents.
**Fix:** Add `--no-browser` to the langgraph dev command in the Makefile and open Studio manually with `http://localhost:{port}`. Or pass `--host localhost` for local-only dev (loses LAN access but fixes Studio).

---

### M-05: Run records never close — `status: "running"` accumulates forever
**File:** `shared/api_server.py`
**Problem:** The gateway creates a run record when an AG-UI stream starts, then closes it when the stream ends. Because the stream hangs (C-01), `db.run_finish()` is never called. Every attempted run remains `status: "running"` with no `finished_at`.
**Impact:** Run history in the API is corrupted. Stats are wrong. The dashboard shows stale "running" indicators.
**Fix:** Add a timeout to the proxy stream (e.g., 5 minutes), and/or fix C-01 so streams complete normally.

---

### M-06: `POST /hotl/read-all` ignores agent filter parameter
**File:** `shared/api_server.py`
**Problem:** `POST /hotl/read-all` accepts `?agent=budget-agent` as a query parameter but the implementation marks ALL logs as read regardless of the filter. (Verified in the frontend's "Mark all read" button behavior.)
**Impact:** Clicking "Mark all read" on a filtered view marks everything as read, not just the filtered agent's logs.

---

### M-07: Schedule `enabled` toggle state not reflected in APScheduler
**File:** `shared/api_server.py`
**Problem:** When a schedule is saved with `enabled: false`, the DB record is updated but APScheduler job is not paused or removed. The scheduler continues firing for disabled schedules.
**Impact:** "Disabled" schedules still run. Users have no reliable way to pause an agent's background runs.

---

## Minor — Polish, cosmetic, UX

### m-01: Memory tab monospace text breaks words mid-word
**File:** `next-dashboard/src/app/agent/[name]/page.tsx` (Memory tab panel)
**Problem:** The preformatted `<pre>` or `<code>` block in the narrow right panel lacks `overflow-wrap: break-word` or `word-break: break-all`. Long lines cause word breaks at panel edge mid-word ("Upd-\nated during each run").
**Fix:** Add `className="whitespace-pre-wrap break-words"` to the memory content container.

---

### m-02: Agents stat card says "3 agents / 4 running"
**File:** `next-dashboard/src/app/page.tsx`
**Problem:** The stat card denominator is `AGENTS.length` (3) but the "N running" count includes all sources including `job-app-chain` (a workflow). Reads as "3 / 4 running" which is confusing.
**Fix:** Count running status only across the 3 AGENTS entries, not WORKFLOWS.

---

### m-03: `http://localhost:8080` hardcoded in two page files
**Files:** `next-dashboard/src/app/agent/[name]/page.tsx`, `next-dashboard/src/app/workflow/[name]/page.tsx`
**Problem:** "Run now" and schedule trigger buttons call `fetch('http://localhost:8080/schedules/...')` directly, bypassing `AGENT_API_URL`.
**Fix:** Use `const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'` consistently.

---

### m-04: Chat messages render top-down instead of anchoring to bottom
**File:** `next-dashboard/src/app/agent/[name]/page.tsx`
**Problem:** The chat message container stacks messages from the top. As the conversation grows the user scrolls down. Standard chat UX anchors messages to the bottom so the latest is always visible.
**Fix:** Add `flex flex-col-reverse` or auto-scroll logic to the message list container.

---

### m-05: Workflow description in header shows 4 steps, graph shows 5
**File:** `next-dashboard/src/lib/agents.ts`
**Problem:** Workflow description says "scrape → classify → optimize → apply" (4) but the execution graph renders 5 nodes (Sheets Reader, Scraper, Classifier, Optimizer, Sheets Writer).
**Fix:** Update the description string to match: "read → scrape → classify → optimize → write".

---

### m-06: "Clear logs" button shows success even when endpoint is missing
**File:** `next-dashboard/src/app/settings/page.tsx`
**Problem:** The `clearLogs()` function has no error handling — it shows "Cleared" regardless of whether the fetch succeeded or failed.
**Fix:** Check response status and show an error state if the call fails.

---

### m-07: Next.js Dev Tools button overlaps UI in bottom-left
**All pages**
**Problem:** The floating "Open Next.js Dev Tools" button is visible in production-like screenshots. This is fine for dev but worth hiding or moving.

---

## Missing Features — Not implemented, not in docs

### F-01: No persistent chat threads / session management
There is no mechanism to list, resume, or name past conversations with an agent. Every session is ephemeral. For an agent that manages your budget, this is table-stakes: you need to say "remember last week we talked about groceries" and have it work.
**Needs:** Thread ID persistence (localStorage min, DB preferred), thread list UI, thread switching in the agent chat panel.

---

### F-02: No real-time cost + token display during chat
The chat UI shows no token or cost information. For a cost-tracking system this is a major gap. Users have no feedback on how expensive a conversation is.
**Needs:** Display running token count and estimated cost in the chat header or footer, populated from LangGraph's `usage_metadata`.

---

### F-03: No agent run history viewable per agent
The agent detail page has no "past runs" section. The only run history visible is in the HOTL logs page (which is broken, M-02). You can't see what the budget agent did last Tuesday.
**Needs:** Per-agent run history tab (or section in the right panel) showing recent runs with status, duration, and cost. Backed by `GET /runs?agent={name}`.

---

### F-04: No error visibility when agent runs fail
When an agent run errors (e.g., C-03), the user sees nothing in the UI. No badge, no notification, no log entry. The failure is invisible.
**Needs:** Error state surfaced in run records, HOTL entry for failed runs (even partial), and a visual indicator on the agent card when the last run errored.

---

### F-05: `GET /api/logs/[name]/route.ts` exists but is unused
**File:** `next-dashboard/src/app/api/logs/[name]/route.ts`
This route file exists but no page or component currently uses it. May be a leftover from a previous architecture or planned but not wired up.

---

### F-06: `GET /api/history/[name]/route.ts` fetches from non-existent backend
**File:** `next-dashboard/src/app/api/history/[name]/route.ts`
The route exists and tries to fetch `GET /chat/{agent}/history` from the API server, but that endpoint was never implemented. The route always silently returns `{ messages: [] }`.

---

### F-07: No LangSmith trace links in the dashboard
LangSmith is always tracing (when `LANGSMITH_TRACING=true`), but the dashboard has no way to jump to a trace for a specific run. Every run record could include a LangSmith trace URL.
**Needs:** Store and display the LangSmith run URL per run record. LangSmith SDK provides `get_run_url()` after a run completes.

---

### F-08: Schedules page missing "Run history" — no way to see last N scheduled executions
The schedules page shows cron config and last/next run times, but there's no way to see whether the last scheduled run succeeded, what it did, or how long it took.
**Needs:** Collapsed run history per schedule (last 5 runs) with status dots and timestamps, linking to HOTL entries.

---

### F-09: No health check dashboard / service map
The settings page lists ports but doesn't show live health. The only live status is the agent cards on the dashboard (which call `GET /ok` per agent). There's no consolidated "everything is green" view that also shows the API server and database status.

---

## Infrastructure Notes

### I-01: `langgraph dev` watch mode causes hot-reloads mid-conversation
The budget.log shows `"1 change detected"`, `"3 changes detected"` — watchfiles triggers reloads on any file change in the agent directory. This kills in-flight requests and clears in-memory thread state mid-conversation.
**Mitigation:** Use `--no-reload` flag in production-like sessions, or separate the `data/` and `logs/` directories out of the watch path.

---

### I-02: In-memory circuit breaker — resets on API server restart
The circuit breaker state is stored in memory in `api_server.py`. A restart (e.g., after fixing C-06) resets all circuit states. If an agent was OPEN, a restart hides the failure history.
**Mitigation:** Persist circuit breaker state to the DB, or at minimum log circuit transitions.

---

### I-03: No authentication on the API server
`api_server.py` has no auth. Any process on the local network can call `POST /hitl/{id}/resolve`, `POST /hotl/clear`, or `POST /registry/reload`. Acceptable for pure local dev, but worth noting before any port-forwarding or remote access is added.

---

### I-04: SQLite `data/state.db` has no backup or rotation strategy
The entire system state (HITL, HOTL, runs, schedules) lives in one SQLite file. No backups, no WAL mode explicitly configured, no size limits.

---

## Priority Order for Fixes

The system is UI-complete but the backend integration layer is largely broken. Fixing in this order unblocks the most value:

1. **C-06** — Fix `make install` so the system can start reliably
2. **C-03** — Fix `aafter_agent` Runtime API error so runs complete
3. **C-02** — Fix scheduled trigger to use `/runs` instead of `/invoke`
4. **C-01** — Fix AG-UI stream (gateway → agent protocol)
5. **M-01 + F-01** — Chat history persistence (highest user-facing value)
6. **M-03 + F-02** — Cost and token tracking
7. **C-04 + C-05** — Finish missing backend endpoints (stream, hotl/clear)
8. **M-04** — LangSmith `0.0.0.0` → localhost
9. **F-07** — LangSmith trace links in run records
10. **Minor fixes** — m-01 through m-07 as time allows
