# Plan: Multi-Agent Dashboard UI — Full Rebuild

Branch: `claude/multi-agent-dashboard-ui-1bYr9`

---

## Vision Summary

**Jimmy's Agents** becomes an OpenClaw-style personal agent OS. A dark glassmorphism Next.js dashboard that monitors all agents, shows live run streams, handles HITL approvals, reviews HOTL logs, schedules cron jobs, and has a creative "Agent Council" page for A2A coordination.

---

## Design System

**Aesthetic**: Dark glassmorphism — `#0d0d0d` base, `#1a1a1a` glass cards with `backdrop-blur`, neon border glow per agent.

**Per-agent accent colors** (neon):
- gmail-agent → `#00ff88` (green)
- calendar-agent → `#00d4ff` (cyan)
- budget-agent → `#a855f7` (violet/purple)
- job-app-chain → `#f59e0b` (amber)

**Sleep/Wake animations** (Framer Motion):
- `SLEEPING`: dim opacity (0.5), slow breathing pulse (scale 1.0 → 1.02 every 3s), blurred border
- `RUNNING`: full opacity, animated neon border shimmer, spinning orb
- `IDLE`: full opacity, solid dim border
- `ERROR`: red border, shake animation

**Font**: JetBrains Mono (already configured)

**shadcn/ui**: Install component library for Badge, Button, Dialog, Tabs, Separator, Tooltip, Switch, Calendar, Popover, Command

---

## Architecture

### Frontend: Next.js 16 (existing `next-dashboard/`)
- Build on existing skeleton (keep globals.css design tokens, extend them)
- Add shadcn/ui, keep Framer Motion + Tailwind 4
- No new separate app — expand existing one

### Backend: FastAPI `shared/` + agent-side SQLite
A new `shared/api_server.py` FastAPI app (port 8080) that:
- Reads/writes `shared/state.db` (SQLite) for HITL inbox, HOTL logs, run records, schedule configs
- Exposes REST endpoints consumed by Next.js API routes
- Has WebSocket endpoint `/ws/runs/{agent_name}` for live streaming
- APScheduler instance that triggers agent runs on configured cron schedules

### Memory / Rules (per agent)
Each agent directory gets:
- `MEMORY.md` — short-term notes, written/updated by the agent during runs
- `RULES.md` — behavioral rules, agent-editable (dashboard shows read-only view)

### State Store: SQLite (`shared/state.db`)
Tables:
- `hitl_items` — id, agent, type, payload_json, status (pending/approved/rejected), comment, created_at, resolved_at
- `hotl_logs` — id, agent, run_id, summary_json (tools called, thoughts, params), is_read, created_at
- `run_records` — id, agent, started_at, finished_at, status, token_count, cost_usd
- `schedules` — agent, cron_expr, enabled, last_run, next_run
- `stream_events` — id, agent, run_id, event_type, event_json, created_at (for replay)
- `council_contracts` — id, title, parties_json, terms_md, created_at, status

---

## Pages & Routes

### 1. `/` — Home / Agent Fleet
**Grid of agent cards** with glassmorphism + neon accent per agent:
- Sleeping/running/idle/error state with Framer Motion animations
- Notification badge (red dot) on card if pending HITL items
- Hover tooltip: last run time, next scheduled run, token count
- Click → agent profile page

**Sidebar**: navigation to all pages with notification counts

### 2. `/agent/[name]` — Agent Profile (REBUILD EXISTING)
**Tabs**:
1. **Live Run** — SSE/WebSocket stream of current run showing:
   - Thought bubbles (internal reasoning)
   - Tool call cards (name, params, result)
   - Todo list (updating live via `write_todos`-style events)
   - "Trigger Run Now" button
2. **Config** — Editable:
   - Cron schedule (cronstring input with human-readable preview)
   - System prompt
   - Task instructions
3. **Memory & Rules** — Read-only viewer for `MEMORY.md` + `RULES.md` (rendered as markdown, labeled "agent-managed only")
4. **HITL / HOTL** — Per-agent inbox + post-hoc log filtered to this agent

### 3. `/inbox` — HITL Inbox (REBUILD EXISTING)
- Global list of all pending HITL items across all agents
- Each item: agent badge, type, payload preview, **Approve** / **Reject** buttons
- Optional comment textarea before approving/rejecting (sent back to agent)
- Resolved items shown below with outcome + timestamp

### 4. `/hotl` — HOTL Activity Feed (NEW)
- Reverse-chronological feed of all post-hoc agent logs
- Each entry: agent badge, run timestamp, **read/unread** indicator (bold if unread)
- Expandable accordion showing: thoughts, tool calls (name + params + result), summary
- "Mark all read" button
- Filter by agent

### 5. `/schedules` — Schedule Calendar (NEW)
- Monthly/weekly calendar grid (using shadcn Calendar + custom overlay)
- Each scheduled run shown as a colored event block (per-agent color)
- Click event → run details (if past) or upcoming info (if future)
- Sidebar: table of all agent cron schedules with enable/disable toggle and edit button

### 6. `/council` — Agent Council (NEW, CREATIVE)
**The group meeting room**:
- Visual: Round table SVG with agent avatars seated around it (neon glow per agent)
- Each agent seat shows: name, status indicator, last active
- **Contracts panel** (right side): list of existing inter-agent agreements
  - Each contract: title, parties (agent names), terms (markdown), status (draft/active/archived)
  - "Create new contract" → opens a modal with a markdown editor
- **Council Chat** (bottom): A shared message thread that any agent can post to, or the user can post to broadcast to all agents
- A2A framing: contracts define how agents agree to hand off work (e.g., "gmail-agent gives job leads to job-app-chain")
- Visual flair: when a contract is "signed", a pulse animation radiates from both agent seats

### 7. `/feed` — HOTL Feed (alias of `/hotl` or separate live feed)
Full-screen live event feed from all agents — shows events in real-time as they stream in, color-coded by agent. Like a terminal but prettier.

### 8. `/stats` — Stats & Costs (NEW)
- Token usage chart (bar chart, per agent, 7d/30d/all-time)
- Cost estimate table (runs × tokens × $/token)
- Run success rate per agent
- Average latency trend

### 9. `/search` — Global Search (NEW)
- Debounced search across: MEMORY.md content, RULES.md content, HOTL logs, run titles
- Grouped results by type
- Click result → navigate to relevant agent page or log entry

### 10. `/settings` — Settings / Admin (NEW)
- Add/remove agent definitions (name, port, icon, accent color)
- Global settings: polling intervals, notification preferences
- Danger zone: clear all logs, reset schedules

---

## Implementation Phases

### Phase 1: Foundation & Design System
1. Install shadcn/ui into `next-dashboard/`
2. Add glassmorphism CSS tokens + per-agent accent color system to `globals.css`
3. Rebuild `AgentCard` with neon glow, sleep/wake Framer Motion animations, HITL badge
4. Rebuild `LayoutShell` with full sidebar nav (all pages + notification counts)
5. Create `shared/state.db` SQLite schema + migration script
6. Create `shared/api_server.py` FastAPI backend (REST + WebSocket)
7. Makefile: add `run-api-server` target, update `start-all`

### Phase 2: Home + Agent Profile
8. Rebuild `/` (Home) with new glassmorphism agent fleet grid
9. Rebuild `/agent/[name]` with 4-tab layout:
   - Live Run tab (WebSocket stream consumer)
   - Config tab (cron + prompt editor, writes to `state.db`)
   - Memory & Rules tab (reads `MEMORY.md` + `RULES.md` from agent dir)
   - HITL/HOTL tab (per-agent filtered views)
10. Add `MEMORY.md` + `RULES.md` stub files to each agent directory
11. APScheduler integration in `api_server.py` — reads schedule config from DB, triggers LangGraph runs

### Phase 3: HITL + HOTL
12. Build `/inbox` — HITL approval UI with approve/reject + comment
13. Build `/hotl` — HOTL feed with read/unread, expandable tool call logs
14. Wire HITL protocol: agent writes pending item → API → dashboard displays → user resolves → agent polls for decision
15. Wire HOTL logging: agent writes structured post-run summary → API → dashboard

### Phase 4: Schedules + Stats + Search
16. Build `/schedules` — Calendar + cron table with enable/disable
17. Build `/stats` — Cost/token charts (use recharts or built-in SVG)
18. Build `/search` — Debounced global search

### Phase 5: Agent Council (Creative)
19. Build `/council` — Round table layout with agent avatars
20. Council contracts CRUD (create, view, archive)
21. Council chat (broadcast messages to all agents)
22. A2A contract animations

### Phase 6: Polish & Wire Agents
23. Add MEMORY.md + RULES.md writing capability to each agent
24. Add HOTL structured logging to each agent (writes summary after each run)
25. Add HITL gating to job-app-chain (already partially exists)
26. Stream events from langgraph to WebSocket endpoint
27. Update CLAUDE.md with new rules

---

## Key Technical Decisions

### Streaming
- LangGraph SDK streams SSE from each agent's `langgraph dev` server (`/stream` endpoint)
- `api_server.py` acts as a proxy/relay: subscribes to langgraph stream, writes events to `stream_events` table, and re-emits via WebSocket to dashboard
- Dashboard consumes WebSocket for live run view

### Schedule Triggering
- APScheduler in `api_server.py` reads `schedules` table on startup
- When cron fires: POST to agent's langgraph `/invoke` endpoint
- Dashboard config changes update `schedules` table + reschedule the APScheduler job live (no restart needed)

### HITL Protocol
1. Agent tool calls `hitl_request(type, payload)` → writes to `hitl_items` table via API
2. Agent then polls `GET /hitl/{id}` every 5s until status != pending
3. Dashboard shows pending items with approve/reject UI
4. User resolves → status + optional comment written to DB
5. Agent receives decision and continues

### HOTL Logging
- After each run, agent writes structured summary to `hotl_logs` via `POST /hotl`
- Summary includes: list of tool calls `{name, params, result}`, agent thoughts, overall summary
- Dashboard shows with read/unread state

### Memory
- `MEMORY.md`: agent appends key facts/context after each run using file write tool
- `RULES.md`: agent can rewrite its own behavioral rules (e.g., "always cc Jimmy on emails about jobs")
- Dashboard shows these files read-only via `GET /agents/{name}/memory` and `/rules` endpoints (API server reads the file)

---

## Files to Create/Modify

### New Files
- `shared/api_server.py` — FastAPI backend
- `shared/db.py` — SQLite helpers + schema
- `shared/scheduler.py` — APScheduler setup
- `shared/hitl.py` — HITL protocol helpers
- `shared/hotl.py` — HOTL logging helpers
- `{agent}/MEMORY.md` — per-agent (4 agents)
- `{agent}/RULES.md` — per-agent (4 agents)
- `next-dashboard/src/app/hotl/page.tsx`
- `next-dashboard/src/app/council/page.tsx`
- `next-dashboard/src/app/schedules/page.tsx`
- `next-dashboard/src/app/stats/page.tsx`
- `next-dashboard/src/app/search/page.tsx`
- `next-dashboard/src/app/settings/page.tsx`
- `next-dashboard/src/app/api/hitl/route.ts`
- `next-dashboard/src/app/api/hotl/route.ts`
- `next-dashboard/src/app/api/memory/[name]/route.ts`
- `next-dashboard/src/app/api/schedules/route.ts`
- `next-dashboard/src/app/api/stats/route.ts`
- `next-dashboard/src/app/api/search/route.ts`
- `next-dashboard/src/app/api/council/route.ts`
- `next-dashboard/src/app/api/ws/[name]/route.ts` (WebSocket relay)
- `next-dashboard/src/components/agent-card.tsx` (rebuild)
- `next-dashboard/src/components/layout-shell.tsx` (rebuild)
- `next-dashboard/src/components/hitl/inbox-item.tsx`
- `next-dashboard/src/components/hotl/log-entry.tsx`
- `next-dashboard/src/components/run/live-stream.tsx`
- `next-dashboard/src/components/run/tool-call-card.tsx`
- `next-dashboard/src/components/run/todo-list.tsx`
- `next-dashboard/src/components/council/round-table.tsx`
- `next-dashboard/src/components/council/contract-panel.tsx`
- `next-dashboard/src/components/schedules/cron-editor.tsx`

### Modify
- `next-dashboard/globals.css` — add glassmorphism tokens + agent accent colors
- `next-dashboard/src/lib/agents.ts` — add accent colors, memory paths
- `next-dashboard/src/app/page.tsx` — rebuild home
- `next-dashboard/src/app/agent/[name]/page.tsx` — rebuild with tabs
- `next-dashboard/src/app/api/agents/route.ts` — add schedule/HITL count data
- `Makefile` — add `run-api-server`, update `start-all`
- `CLAUDE.md` — update rules
