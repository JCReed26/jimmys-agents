# jimmys-agents — Issue Tracker

**Status as of 2026-03-28**: The harness is feature-complete. Auth, multi-tenancy, admin dashboard, HOTL pipeline, persistent chat, memory editor, and health panel are all shipped. Focus shifts to agent building.

---

## Open Items

### U-01: Real-time Cost + Token Display During Chat
**Problem**: Costs are captured in Postgres, but the live chat UI doesn't display running token counts or cost during the conversation.
**Fix**: Stream `usage_metadata` tokens/cost into the chat header or footer. The `StreamTranslator` already accumulates this — just needs surfacing in the AG-UI event flow.

### U-02: Schedules Page Run History
**Problem**: The schedules page shows cron configs but no quick-glance run history per schedule.
**Fix**: Collapsed run history per schedule showing last 5 runs (status dots + timestamps). Fetches from `GET /api/runs/{agent}`.

### U-03: Dead Route Cleanup
**Problem**: `app/api/logs/[name]/route.ts` and `app/api/history/[name]/route.ts` may be unused and redundant.
**Fix**: Audit and remove dead proxy routes.

---

## Resolved (do not re-open)

### ✅ A-01/A-02/A-03: Admin Dashboard
Superadmin page at `/admin` — tenants tab (create/list), agents tab (assign/remove per tenant), users tab (link Supabase auth UUIDs). Backend gated on `JAMES_TENANT_ID`.

### ✅ Auth & Multi-Tenancy
Supabase OTP passwordless. JWT verified in FastAPI. All DB queries tenant-scoped. Internal key bypass for agent→gateway calls.

### ✅ HOTL Pipeline
Gateway-owned. `StreamTranslator` accumulates tool calls, tokens, cost from the AG-UI stream and writes HOTL entry on stream end. LangSmith trace links in logs page.

### ✅ Persistent Chat Threads
Thread IDs stored in localStorage with array (max 10). Thread picker dropdown in chat. History loaded on mount from `GET /agents/{name}/history`.

### ✅ Agent Memory Editor
Memory tab shows `skills/AGENTS.md` from the agent's filesystem directory. Editable from dashboard via `GET/PUT /agents/{name}/agents-md`. The agent reads/writes this file during runs.

### ✅ Run History Tab
Per-agent run history table in the agent detail page. Shows status, date, cost, tokens, LangSmith trace link.

### ✅ Health Panel
Settings page shows live service health. Fetches each service's `/ok` endpoint with 2s timeout. Auto-refreshes every 30s.

### ✅ SQL Query Organization
All DB queries in `backend/sql/` as named `-- name: query_name` files. `backend/sql_loader.py` parses and caches. No inline SQL in `api_server.py` or `db_postgres.py`.

### ✅ DB Migrations
Postgres schema on Supabase. Migrations in `backend/migrations/`. All migrations applied. UNIQUE constraint on `(tenant_id, agent, workflow)` in schedules table.

### ✅ Error Indicators on Agent Cards
Dashboard agent cards show last run status (red dot on error, muted "No runs yet").
