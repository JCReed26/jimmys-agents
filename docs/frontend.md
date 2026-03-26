# Frontend Documentation — jimmys-agents Dashboard

## Overview

The dashboard is a Next.js 15 App Router application at `http://localhost:3000`. It is a monitoring and control interface for a set of Python LangGraph agents and workflow automations running locally.

**All pages degrade gracefully when the backend is offline.** API calls are wrapped in try/catch and return empty states — no page should crash or show a blank screen without backend services running.

---

## Service Map

| Service | Port | Role |
|---|---|---|
| Next.js dashboard | 3000 | Frontend (this app) |
| FastAPI API server | 8080 | Central backend — HITL, HOTL, stats, schedules, memory |
| gmail-agent (LangGraph) | 8001 | Chat + background email runs |
| calendar-agent (LangGraph) | 8002 | Chat + calendar management |
| budget-agent (LangGraph) | 8003 | Chat + budget tracking |
| job-app-chain (LangGraph) | 8004 | Workflow automation |

---

## Agent / Workflow Registry

Defined in `src/lib/agents.ts`. This is the source of truth for all agent metadata.

**Agents** (conversational chatbots, chat is the primary UI):
- `gmail-agent` — accent `#00ff88`, port 8001
- `calendar-agent` — accent `#00d4ff`, port 8002
- `budget-agent` — accent `#a855f7`, port 8003

**Workflows** (graph automations, graph visualization is primary UI):
- `job-app-chain` — accent `#f59e0b`, port 8004

---

## Navigation (Layout Shell)

**File:** `src/components/layout-shell.tsx`

shadcn/ui `Sidebar` component. Nav groups:

```
OVERVIEW
  Dashboard          /

AGENTS
  Gmail              /agent/gmail-agent
  Calendar           /agent/calendar-agent
  Budget             /agent/budget-agent

WORKFLOWS
  Job Applications   /workflow/job-app-chain

MONITORING
  Observability      /observe
  Run Logs           /logs
  Inbox              /inbox      [badge: pending HITL count]
  Schedules          /schedules

SYSTEM
  Profile            /profile
  Settings           /settings
```

The Inbox nav item polls `GET /api/nav-counts` and shows a red badge when HITL items are pending. The sidebar has a collapse/expand toggle via `SidebarTrigger`.

---

## Pages

### 1. Dashboard `/`

**File:** `src/app/page.tsx`

**Data sources:**
- `GET /api/agents` — agent statuses (running/idle, hitlCount, totalRuns, lastRun, costToday)
- `GET /api/hotl?limit=10` — recent activity feed
- `GET /api/stats` — aggregate cost/token stats
- Polls every 20 seconds via `setInterval`

**Components:**

**Stat cards (4):**
| Card | Value | Source |
|---|---|---|
| Agents | count + "N running" | AGENTS registry + agentData statuses |
| Workflows | count + workflow run count | WORKFLOWS registry |
| HITL Pending | total pending count | sum of hitlCount across all agents |
| Cost Today | `$X.XX` | stats.by_agent cost sum |

**Agent cards (3):** One per agent in `AGENTS`. Shows:
- Icon with accent color background
- Status dot (pulsing = running, solid muted = idle)
- HITL badge if agent has pending items
- "Chat →" hover link
- Last run timestamp (relative: "5m ago")
- Clicking the card navigates to `/agent/[name]`

**Workflow card (1):** Shows job-app-chain with:
- 5-step pipeline preview: `reader → scraper → classifier → optimizer → writer`
- Status dot
- Total run count
- "View graph →" hover link
- Clicking navigates to `/workflow/job-app-chain`

**Activity feed:** Last 8 HOTL entries. Each row shows:
- Accent-colored dot (filled = unread, transparent = read)
- Agent name in accent color
- Overview text (truncated)
- Relative timestamp

**Test with backend:**
1. Start API server — stat cards should show real values
2. Trigger an agent run — status dot should pulse on the relevant card
3. Create a HITL item via agent — HITL Pending card should increment
4. Run an agent to completion — activity feed should show the new entry

---

### 2. Agent Detail `/agent/[name]`

**File:** `src/app/agent/[name]/page.tsx`

Valid names: `gmail-agent`, `calendar-agent`, `budget-agent`. Unknown names render an inline error (no crash, no 404 page).

**Layout:** Full-height split — chat panel left, collapsible right panel (272px / 320px on xl).

#### Chat Panel

**Hook:** `src/hooks/use-agent-chat.ts`

Flow:
1. User types in `<Textarea>` — Enter sends, Shift+Enter adds newline
2. Hook POSTs to `POST /api/chat/[agent]` with LangGraph stream format:
   ```json
   { "input": { "messages": [{ "role": "human", "content": "..." }] },
     "config": { "configurable": { "thread_id": "thread_1234567890" } },
     "stream_mode": ["updates"] }
   ```
3. API route proxies to `http://localhost:[port]/runs/stream` (LangGraph server)
4. Response is SSE — hook reads line by line, parses `data: {...}` events
5. AI messages render with `<ReactMarkdown>` (prose-sm prose-invert)
6. Tool calls appear in `thinking` field as `> Calling tool \`name\` with args: {...}`
7. While streaming: bouncing dots animation; cursor blink when content is present

**Message bubbles:**
- Human: right-aligned, `bg-muted`
- AI: left-aligned, `bg-card border-border`
- Both have avatars (User icon / Bot icon in accent color)
- AI messages have a collapsible `<details>reasoning…</details>` if thinking is non-empty
- Errors render in a `bg-destructive/10 border-destructive/30` panel below messages

**Test with backend:**
1. Navigate to `/agent/gmail-agent`
2. Type "What emails do I have today?" — send
3. Should see bouncing dots, then AI response streaming in
4. If agent uses tools (e.g., Gmail search), thinking section should appear and be expandable
5. Test Enter vs Shift+Enter behavior
6. Test that send button colors with accent color when input has text
7. Disconnect backend — should see error message inline, not crash

#### Right Panel — 3 Tabs

**Schedule tab** (default):
- Shows current cron expression for this agent loaded from `GET /api/schedules`
- Input field for cron expression (font-mono)
- 5 preset buttons: `15m`, `30m`, `1h`, `9am`, `8pm`
- Task prompt textarea
- Enabled/disabled toggle pill (emerald = enabled, muted = disabled)
- "Save schedule" button → `POST /api/schedules` with `{ agent, cron_expr, enabled, task_prompt }`
- "Run now" button → `POST http://localhost:8080/schedules/[agent]/trigger`
- Last run timestamp if available

**Test with backend:**
1. Click a cron preset — field should update
2. Toggle enabled/disabled — pill color should switch
3. Click Save — button should show "Saving…" spinner then "Saved" checkmark for 2s
4. Click Run now — button briefly shows loader, then returns

**Memory tab:**
- Loads from `GET /api/memory/[name]` on tab switch
- Shows `MEMORY.md` and `RULES.md` sections in monospace preformatted blocks
- Empty state: "No memory files found. The agent will create them during runs."
- Files are read-only — agents manage their own memory

**Test with backend:**
1. Click Memory tab — should load and display agent's MEMORY.md / RULES.md content
2. If files don't exist yet, empty state message should appear

**HITL tab:**
- Loads from `GET /api/hitl?agent=[name]` on tab switch
- Shows pending items only (status === "pending")
- Each item shows: created_at timestamp, JSON payload in pre block (pretty-printed)
- Approve button: `POST /api/hitl/[id]` with `{ decision: "approved" }` — removes item from list
- Reject button: same with `{ decision: "rejected" }`
- Empty state: checkmark icon + "No pending items"

**Test with backend:**
1. Trigger an agent action that creates a HITL item
2. Switch to HITL tab — item should appear with payload
3. Click Approve — item should disappear from list immediately (optimistic removal)
4. Click Reject — same behavior

---

### 3. Workflow Detail `/workflow/[name]`

**File:** `src/app/workflow/[name]/page.tsx`

Valid names: `job-app-chain`. Unknown names render inline error.

**Data sources:**
- `GET /api/hitl?agent=[name]` — pending HITL gates
- `GET /api/hotl?agent=[name]&limit=10` — run history
- `useAgUiStream(name)` hook — SSE from `GET /api/stream/[agent]` for live step events

#### Header

- Workflow icon + name + "workflow" badge in amber
- HITL pending badge (destructive red) when items exist
- "Run workflow" button → `POST http://localhost:8080/schedules/[name]/trigger`
  - Disabled while triggering or stream.runStatus === "running"
  - Shows spinner + "Running…" when active

#### Execution Graph

5 step nodes connected by horizontal arrows:
```
Sheets Reader → Scraper → [HITL] Classifier → [HITL] Optimizer → Sheets Writer
```

Node states (driven by `useAgUiStream`):
- **Idle:** zinc background, hollow circle icon
- **Active:** accent color background + border, spinning Loader2 icon
- **Done:** green background + border, CheckCircle2 icon

HITL markers appear as `HITL` label above the connector arrows before Classifier and Optimizer nodes.

#### Live Stream (2/3 width)

`<AgUiStream agent={name} accentColor={cfg.accentColor} />`
**File:** `src/components/run/ag-ui-stream.tsx`
**Hook:** `src/hooks/use-ag-ui-stream.ts`

The hook connects to `GET /api/stream/[agent]` (SSE). Events handled:
- `RUN_STARTED` — clears previous run, sets status to "running"
- `RUN_FINISHED` — sets status to "completed" or "error"
- `TEXT_MESSAGE_START/CONTENT/END` — builds streaming text messages
- `TOOL_CALL_START/ARGS/RESULT` — builds tool call cards
- `STEP_STARTED/FINISHED` — drives node state in the graph
- `ERROR` — sets error state

Reconnect behavior: retries up to 3 times on connection failure (4s delay), then stops.

**Test with backend:**
1. Click "Run workflow"
2. Step nodes should light up amber as each step executes
3. Live stream panel should show tool calls and messages as they arrive
4. When done, nodes should turn green and status returns to idle

#### Side Panel (1/3 width)

**HITL Gates card:**
- Lists pending HITL items in amber-bordered cards
- Each shows: step name, timestamp, JSON payload (max-h-24 scrollable)
- Approve/Reject buttons → `POST /api/hitl/[id]` — removes item optimistically
- Empty state: green checkmark + "No pending approvals"

**Run history card:**
- Shows last 5 runs from HOTL logs
- Each row: status dot (green/red), date, cost
- Empty state: "No runs yet"

#### Memory Update Chat Drawer (bottom)

Collapsed by default. Click header to expand.

- Agent selector: `Classifier` / `Optimizer` toggle buttons
- Selected agent determines which LangGraph endpoint receives the message
- Chat thread (max-h-48 scrollable)
- Textarea input + send button
- Uses same `useAgentChat` hook — sends to `POST /api/chat/[selectedAgent]`
- Labeled "(changes take effect on next run)" — this updates agent memory, not triggers a run

**Test with backend:**
1. Click "Update agent memory" — drawer should expand
2. Switch between Classifier / Optimizer buttons
3. Type a message like "Never apply to jobs at Google" — send
4. Agent should respond confirming the memory update

---

### 4. Observability `/observe`

**File:** `src/app/observe/page.tsx`

**Data source:** `GET /api/stats` — polls every 30 seconds.

**Stats response shape:**
```json
{
  "total_runs": 42,
  "total_tokens": 150000,
  "total_cost": 0.45,
  "by_agent": {
    "gmail-agent": { "runs": 10, "tokens": 50000, "cost": 0.15 }
  }
}
```

**Stat cards (4):**
| Card | Value |
|---|---|
| Total cost | `$0.0000` (4 decimal places) + monthly extrapolation |
| Total tokens | formatted (k/M suffix) + run count |
| Avg cost/run | `$0.00000` (5 decimal places) |
| Avg tokens/run | formatted number |

**Per-agent breakdown table:**
- Columns: Source, Runs, Tokens, Cost
- One row per agent + workflow in `ALL_SOURCES`
- Shows accent-colored icon + "agent" or "workflow" badge
- All values `0` when no data

**Token distribution spark bars:**
- Only renders when `by_agent` has data
- One bar per source — percentage of total tokens
- Bar width and color driven by each source's accent color

**Test with backend:**
1. After some agent runs, stats should show real values
2. Monthly extrapolation = total_cost × 30
3. Verify token bars scale correctly relative to each other

---

### 5. Run Logs `/logs`

**File:** `src/app/logs/page.tsx`

**Data source:** `GET /api/hotl?limit=50[&agent=X]`

HOTL = Human-on-the-Loop. Post-run summaries written by agents after each background run.

**Filters:**
- **Agent filter:** "All agents" + one button per agent/workflow in `ALL_SOURCES` — filters by source
- **Status filter:** all / success / error
- Agent filter is query-driven (refetches); status filter is client-side

**Log rows:**
- Unread entries have left border in agent's accent color
- Clicking a row expands it AND marks it read (`POST /api/hotl/[id]/read`)
- Each row shows: agent name (accent color), error badge if status=error, tool count, relative time, overview text

**Expanded row sections:**
- **Overview:** full overview text
- **Tool calls:** list of `{ name, params, result }` — each in monospace card, truncated to 200 chars
- **Reasoning:** list of thought strings, left-bordered
- Absolute timestamp at bottom

**Mark all read button:** Visible only when `unreadCount > 0`. Calls `POST /api/hotl/read-all`.

**Test with backend:**
1. After agent runs, logs should appear
2. Unread logs have accent-colored left border
3. Click a log to expand — left border should disappear (marked read)
4. Filter by specific agent — list should narrow
5. Filter by "error" — only failed runs shown
6. "Mark all read" button should appear then disappear after click

---

### 6. HITL Inbox `/inbox`

**File:** `src/app/inbox/page.tsx`

**Data source:** `GET /api/hitl` — all HITL items across all sources.

HITL = Human-in-the-Loop. Items agents create when they need a human decision before continuing.

**Tabs:**
- **All** — every HITL item, badge shows total pending count
- **Agents** — only items from `AGENTS` keys (gmail, calendar, budget)
- **Workflows** — only items from `WORKFLOWS` keys (job-app-chain)

**Pending section:**
- Each item in a card with left border in agent's accent color
- AlertTriangle icon + agent display name + optional step badge + timestamp
- JSON payload in monospace pre block (max-h-40 scrollable)
- Approve button (emerald) + Reject button (destructive)
- Resolving state: buttons show "…" while request is in flight
- After resolve: item status updates to "approved"/"rejected", moves to Resolved section

**Resolved section:**
- Shows last 10 resolved items, read-only (no buttons)
- Status badge: "approved" (emerald) or "rejected" (destructive red)

**Approve all button:** Visible only when pending items exist. Calls `resolve()` on all pending in parallel.

**Empty state:** Green checkmark card "All clear / No pending HITL items"

**Test with backend:**
1. Trigger an action that creates a HITL item (e.g., run job-app-chain to classifier step)
2. Item should appear in "All" and "Workflows" tabs with payload
3. Click Approve — item should move to Resolved section with "approved" badge
4. Click Reject on another item — "rejected" badge
5. Test "Approve all" with multiple pending items
6. Verify tab counts update correctly

---

### 7. Schedules `/schedules`

**File:** `src/app/schedules/page.tsx`

**Data source:** `GET /api/schedules` — returns array of schedule objects.

Covers agents only (`AGENTS` keys). Workflows are managed from their detail page.

**Default schedule if none exists in DB:** `*/30 * * * *`, enabled.

**Schedule row (collapsed):**
- Agent icon in accent color
- Agent display name
- Cron expression in monospace code block
- Human-readable translation (e.g., "Every 30 min") — known presets only
- Last run + next run timestamps (if available)
- "on" / "off" pill (emerald = enabled, muted = disabled)
- "Run" button → `POST http://localhost:8080/schedules/[agent]/trigger`
- "Edit" button → expands form

**Edit form (expanded):**
- Cron expression input (font-mono)
- 6 preset buttons: "Every 15 min", "Every 30 min", "Hourly", "Daily 9am", "Daily 8pm", "Weekdays 9am"
- Task prompt textarea
- Enabled/disabled toggle pill
- "Save schedule" button → `POST /api/schedules` — collapses form and reloads on success

**Test with backend:**
1. All 3 agent rows should render (gmail, calendar, budget)
2. Click Edit on any row — form should expand, row border highlights in accent color
3. Click a cron preset — cron input should update
4. Toggle enabled — pill should switch color
5. Click Save — button shows "Saving…" then "Saved" checkmark, form collapses
6. Click Run — button shows spinner briefly, then returns (actual run starts in background)

---

### 8. Profile `/profile`

**File:** `src/app/profile/page.tsx`

Static/local-state page — no backend API calls.

**Sections:**
- **Identity card:** gradient avatar (calendar → budget CSS vars), name "James Christopher", role "Founder · Epoch Systems", location
- **Business context textarea:** pre-filled bio. Save button shows "Saved" checkmark for 2s (local state only — not persisted to backend)
- **Active agents list:** one row per agent with icon, name, description, port badge
- **Workflows list:** same layout as agents
- **Demo mode toggle:** visual toggle switch — when on shows a teal info banner. State is local (resets on page reload)

**Test:**
1. Edit the business context textarea — text should be editable
2. Click Save — "Saved" checkmark appears for 2 seconds
3. Toggle demo mode — info banner appears/disappears
4. Verify all 3 agents and 1 workflow appear with correct ports

---

### 9. Settings `/settings`

**File:** `src/app/settings/page.tsx`

**Sections:**

**Services card:** Tabular list of all services with their ports:
- Dashboard → :3000
- API Server → :8080
- Gmail (agent) → :8001
- Calendar (agent) → :8002
- Budget (agent) → :8003
- Job Applications (workflow) → :8004

**Environment card:** Read-only display of:
- `AGENT_API_URL` (from `NEXT_PUBLIC_API_URL` env var, default `http://localhost:8080`)
- `NODE_ENV`

**Danger zone card:**
- "Clear run logs" button → `POST /api/hotl/clear`
- Shows "Clearing…" spinner during request, "Cleared" checkmark for 2s on success
- Red destructive styling

**Test with backend:**
1. Click "Clear logs" — button shows loading state then success
2. Navigate to `/logs` — should now be empty
3. Verify environment values display correctly

---

### 10. Legacy Redirects

- `/hotl` → renders message pointing users to `/logs` (HOTL page was renamed)
- `/search` and `/stats` — legacy pages that still exist but are superseded by newer pages

---

## API Routes (Next.js Proxies)

All routes in `src/app/api/` proxy to the FastAPI backend at `http://localhost:8080` (configurable via `AGENT_API_URL` env var).

| Method | Route | Proxies to | Purpose |
|---|---|---|---|
| GET | `/api/agents` | `GET /agents` | Agent statuses |
| GET | `/api/stats` | `GET /stats` | Aggregate usage stats |
| GET/POST | `/api/schedules` | `GET/POST /schedules` | Schedule read/write |
| GET | `/api/hotl` | `GET /hotl` | Run logs (HOTL) |
| POST | `/api/hotl/read-all` | `POST /hotl/read-all` | Mark all logs read |
| POST | `/api/hotl/[id]/read` | `POST /hotl/[id]/read` | Mark one log read |
| GET | `/api/memory/[name]` | `GET /memory/[name]` | Agent MEMORY.md + RULES.md |
| GET/POST | `/api/hitl` | `GET/POST /hitl` | HITL items |
| POST | `/api/hitl/[id]` | `POST /hitl/[id]/resolve` | Resolve a HITL item |
| GET/POST | `/api/chat/[agent]` | `POST [agent_url]/runs/stream` | Chat with LangGraph agent (proxies directly to agent port) |
| GET | `/api/stream/[agent]` | `GET /stream/[agent]` | AG-UI SSE stream for background runs |
| GET | `/api/nav-counts` | `GET /nav-counts` | Badge counts for nav |

All routes return sensible empty states (empty arrays, `{ messages: [] }`, etc.) when the backend is unreachable — no 500s bubble to the frontend.

---

## SSE Streaming

### Chat Streaming (`use-agent-chat.ts`)

Used on: Agent detail page chat panel, Workflow memory update drawer.

- `POST /api/chat/[agent]` returns `text/event-stream`
- Frontend reads line-by-line, parses `data: {...}` SSE lines
- LangGraph "updates" mode: events shaped as `{ [nodeName]: { messages: [...] } }`
- AI content extracted from chunks where `type === "ai"` or `role === "ai"`
- Tool calls extracted from `chunk.tool_calls[]` — appended to `thinking` field
- Tool results (`type === "tool"`) also appended to `thinking`

### AG-UI Stream (`use-ag-ui-stream.ts`)

Used on: Workflow detail page live stream, background run monitoring.

- `GET /api/stream/[agent]` is a persistent `EventSource` connection
- Retry limit: 3 attempts, 4s delay between retries, resets on successful open
- Events drive workflow step node states and the live stream component
- `clearRun()` resets messages/toolCalls/steps without disconnecting

---

## State Persistence

- **Chat history:** Each `useAgentChat` call creates a fresh thread ID (`thread_${Date.now()}`). Chat history is not persisted across page reloads at the frontend level. The backend may persist history via `GET /chat/[agent]/history` (the route handler exists but LangGraph in-memory checkpointer won't survive restarts).
- **HITL/HOTL data:** Persisted in `data/state.db` (SQLite) by the API server.
- **Schedules:** Persisted in the same SQLite DB. APScheduler in `api_server.py` reads on startup.
- **Profile bio / demo mode:** Local React state only — resets on page reload.

---

## Design System

- **Framework:** Next.js 15 App Router, TypeScript, shadcn/ui, Tailwind CSS v4
- **Font:** Geist Sans (UI) + Geist Mono (code, metrics, timestamps)
- **Theme:** Dark mode only (zinc-950 background, zinc-900 cards)
- **Accent colors:** Per-agent, applied as CSS custom properties and inline styles

CSS variables (defined in `globals.css`):
```
--agent-gmail:    #00ff88
--agent-calendar: #00d4ff
--agent-budget:   #a855f7
--agent-job:      #f59e0b
```

**Status indicators:**
- Running: pulsing dot in agent accent color (`animate-ping`)
- Enabled schedule: emerald pill `border-emerald-500/40 text-emerald-400`
- HITL pending: destructive red badge
- Unread logs: left border in agent accent color
- Error: `border-destructive/30 bg-destructive/10` panel

---

## Testing Checklist (With Full Backend)

### Prerequisites
```bash
make start-all          # or:
cd next-dashboard && npm run dev    # port 3000
python shared/api_server.py        # port 8080
langgraph dev gmail-agent/         # port 8001
langgraph dev calendar-agent/      # port 8002
langgraph dev budget-agent/        # port 8003
langgraph dev job-app-chain/       # port 8004
```

### Core Flow Tests

1. **Dashboard loads with live data** — stat cards show non-zero values, no skeletons stuck
2. **Agent chat round-trip** — send a message, receive streamed response with tool calls visible in reasoning
3. **Schedule save** — edit cron, save, reload page, confirm persisted
4. **Schedule trigger** — click Run Now on any agent, verify run appears in `/logs` shortly after
5. **Memory view** — navigate to agent Memory tab, verify MEMORY.md / RULES.md content loads
6. **HITL create and resolve** — trigger an action that creates a HITL item, resolve it from `/inbox`, verify it moves to Resolved section
7. **HOTL log appears** — after a full agent run, a new entry should appear in `/logs` with tool calls and overview
8. **Workflow run** — click Run Workflow on `/workflow/job-app-chain`, watch step nodes animate through the graph
9. **Workflow HITL gate** — if classifier/optimizer steps create HITL items, they should appear in the HITL Gates card on the workflow page and in `/inbox` under Workflows tab
10. **Stats update** — after runs, `/observe` should reflect updated token and cost counts
11. **Mark all read** — visit `/logs` with unread entries, click Mark all read, verify borders clear

### Edge Cases
- `/agent/nonexistent` — inline error message, layout shell intact
- `/workflow/nonexistent` — inline error message, layout shell intact
- API server down — all pages show empty states, no console errors beyond the failed fetches
- Agent down but API up — chat sends message, gets 500 from proxy, error appears inline in chat
