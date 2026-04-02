# jimmys-agents — Issue Tracker

**Status as of 2026-03-29**: Harness fully hardened. All security gaps closed, critical runtime crash fixed, frontend stabilized. Codebase is ready for agent development.

---

## Open Items

### U-01: Real-time Cost + Token Display During Chat
**Problem**: Costs are captured in Postgres, but the live chat UI doesn't display running token counts or cost during the conversation.
**Fix**: Stream `usage_metadata` tokens/cost into the chat header or footer. The `StreamTranslator` already accumulates this — just needs surfacing in the AG-UI event flow.

### U-02: Schedules Page Run History
**Problem**: The schedules page shows cron configs but no quick-glance run history per schedule.
**Fix**: Collapsed run history per schedule showing last 5 runs (status dots + timestamps). Fetches from `GET /api/runs/{agent}`.

### I-04: No Postgres RLS
**Problem**: Tenant isolation relies entirely on application-layer `tenant_id` checks in `db_postgres.py`. No database-level Row Level Security. If a query accidentally omits `tenant_id`, data leaks across tenants.
**Fix** (when onboarding real clients): Enable Supabase RLS on each table with `USING (tenant_id = current_setting('app.tenant_id')::uuid)` policies.

### I-05: Cost Estimate Hardcoded to Gemini Rate
**Problem**: `_estimate_cost()` in `api_server.py` uses `tokens * 0.0000005` (Gemini 2.5 Flash flat rate). Agents using other models will have inaccurate cost tracking.
**Fix**: When multi-model support is needed, pass the model name into the translator and look up per-model pricing.

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

### ✅ C-01: serialize() Crash in Admin Endpoints
`serialize()` was called in all five `/admin/*` endpoints but never defined → `NameError` at runtime. Fixed: added `def serialize(row) -> dict: return dict(row)` before the admin section in `api_server.py`.

### ✅ C-04: Auth on POST /registry/reload
`POST /registry/reload` had no auth — anyone could hot-reload the agent registry. Fixed: added `_require_admin(request)` to the handler.

### ✅ C-03: Tenant Check on agents-md Endpoints
`GET/PUT /agents/{name}/agents-md` had no tenant scoping — any authenticated user could read/write any agent's AGENTS.md. Fixed: added `_check_agent_access()` helper that verifies the requested agent is assigned to the requesting tenant (admin bypass included).

### ✅ I-03: JAMES_TENANT_ID / JAMES_TENANT Hardcoded
Superadmin UUID was hardcoded in both `backend/api_server.py` and `frontend/src/app/admin/page.tsx`. Fixed: backend reads from `ADMIN_TENANT_ID` env var (falls back to hardcoded value), frontend reads from `NEXT_PUBLIC_ADMIN_TENANT_ID`. Both added to `.env.example`.

### ✅ U-03: Dead Route Cleanup
`app/api/logs/[name]/route.ts` and `app/api/history/[name]/route.ts` were already absent from the codebase. Issue closed.

### ✅ S-01: _proxy_sse Generator Missing try/finally
Client disconnect mid-stream left `runs.status = 'running'` forever in Postgres. Fixed: added `_run_finished` flag with `try/finally` — if the generator is abandoned before completing, it writes `status = 'interrupted'` to the run record.

### ✅ S-02: Silent Cron Failure on Invalid Expression
Invalid cron expressions were silently swallowed with `pass`. Fixed: now logs `logger.warning(...)` with agent name, schedule name, expression, and error — visible in API server logs.

### ✅ F-01: Thread History Race Condition
Switching threads rapidly could load stale history into the wrong thread's state (blank flash + wrong messages). Fixed: symbol-gated load IDs in `useAgentChat` — stale responses discarded.

### ✅ F-02: No AbortController on Chat Requests
In-flight fetch had no cancellation — sending a new message while a response was streaming left the old response writing to state. Fixed: `AbortController` ref aborts previous request on each `sendMessage` call and on unmount.

### ✅ F-03: No Error Boundaries
Unhandled render errors crashed entire pages with no recovery UI. Fixed: `ErrorBoundary` class component added to `components/ui/error-boundary.tsx`, wrapping `AgentPage`, `AdminPage`, and `InboxPage`.

### ✅ F-04: Unsaved Changes Lost Silently in Memory Editor
Editing AGENTS.md and navigating away discarded changes with no warning. Fixed: `beforeunload` guard + amber "unsaved" badge when `editing && draft !== savedContent`.
