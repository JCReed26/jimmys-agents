# Active State

**Updated**: 2026-03-29
**Branch**: `main` (merged from `feat/supabase-auth` PR #16)
**Status**: Harness fully hardened. All security gaps closed, critical crash fixed, frontend stabilized. Ready to build agents.

---

## What Was Just Built (This PR Cycle)

### Backend
- Supabase JWT auth in `auth_middleware.py` — verifies tokens, sets `request.state.tenant_id`
- `X-Internal-Key` bypass on `POST /hotl` AND `POST /hitl` — allows agents to call without JWT
- Postgres via asyncpg — `backend/db_postgres.py` replaces the old SQLite `backend/db.py`
- `backend/sql/` — all SQL in named query files (`backend/sql_loader.py` parses them)
- `backend/migrations/` — 7 migrations applied to Supabase (`001` through `007`)
- Admin endpoints (`/admin/tenants`, `/admin/agents`, `/admin/users`) gated by JAMES_TENANT_ID
- `GET/PUT /agents/{name}/agents-md` — reads/writes `{agent.dir}/skills/AGENTS.md` from disk
- HOTL pipeline: `StreamTranslator` accumulates cost/tokens from AG-UI stream, writes HOTL on close
- Schedules: renamed `workflow` → `name` (migration 007); one or many schedules per agent supported

### Frontend
- Supabase OTP login flow (`/login`, `/login/verify`)
- Auth server utilities (`src/lib/auth-server.ts`) — Bearer token forwarded in all proxy routes
- Admin page (`/admin`) — tenants / agents / users tabs (superadmin only)
- AGENTS.md viewer/editor on agent Memory tab
- Run history tab on agent detail page
- Health panel on Settings page with live service status
- LangSmith trace links in Logs page
- Persistent chat threads with localStorage thread picker (max 10)
- Error indicators on dashboard agent cards
- Schedules page: full create/edit/delete/trigger UI with modal; shows all schedules across all agents

### Bug Fixes (This Session)
- `trigger_agent_run` signature: added `workflow` (now `name`) param so APScheduler kwargs matched
- HITL tool in budget-deepagent: made async, fixed body schema, added `X-Internal-Key` header
- Auth bypass extended to `POST /hitl` (was only `/hotl`)
- Nested test dedented to top level — pytest was silently skipping it

---

## What Was Just Fixed (2026-03-29 Hardening Session)

### Backend (`backend/api_server.py`)
- **Critical crash**: `serialize()` was undefined in all 5 admin endpoints → `NameError`. Fixed: `def serialize(row) -> dict: return dict(row)` added before admin section.
- **Security**: `POST /registry/reload` had no auth. Fixed: `_require_admin(request)` added.
- **Security**: `GET/PUT /agents/{name}/agents-md` had no tenant check. Fixed: `_check_agent_access()` helper validates agent is assigned to tenant before read/write.
- **Security**: `JAMES_TENANT_ID` hardcoded. Fixed: reads from `ADMIN_TENANT_ID` env var (with fallback).
- **Robustness**: `_proxy_sse` had no `try/finally` — client disconnect left runs as `status='running'` forever. Fixed: `_run_finished` flag + `finally` block writes `status='interrupted'`.
- **Observability**: Invalid cron expressions silently swallowed. Fixed: `logger.warning(...)` with full context.
- **Logging**: Added `import logging` and `logger = logging.getLogger("jimmys-agents.gateway")`.

### Frontend
- **`use-agent-chat.ts`**: Symbol-gated load IDs fix history fetch race condition. `AbortController` ref cancels in-flight chat on new send or unmount.
- **`error-boundary.tsx`**: New `ErrorBoundary` class component in `components/ui/`. Wraps `AgentPage`, `AdminPage`, `InboxPage`.
- **`agent/[name]/page.tsx`**: `MemoryPanel` shows amber "unsaved" badge + `beforeunload` guard when editing with unsaved changes.
- **`admin/page.tsx`**: `JAMES_TENANT` reads from `NEXT_PUBLIC_ADMIN_TENANT_ID` env var.

### Config
- `.env.example`: Added `ADMIN_TENANT_ID` and `NEXT_PUBLIC_ADMIN_TENANT_ID` with documentation.

---

## Current Focus

**Next**: Build agents using the deepagent pattern. Reference: `agents/budget-deepagent/`. Copy `agents/_template/` for new agents.

**Harness is now trusted** — all security gaps and stability issues closed. No known blockers.

---

## Active Decisions

| Decision | Choice | Reason |
|---|---|---|
| HOTL ownership | Gateway (StreamTranslator), not agent | Keeps agent code clean; harness handles all observability |
| Memory tab content | `skills/AGENTS.md` only | That's what the deepagent actually reads at runtime |
| Admin gating | `ADMIN_TENANT_ID` env var (backend) + `NEXT_PUBLIC_ADMIN_TENANT_ID` (frontend) | Moved from hardcoded — same UUID, now configurable |
| SQL organization | Named query files in `backend/sql/` | Easy to audit what queries exist; no inline SQL |
| Thread IDs | `thread-{tenant_id}-{agent}-{uuid4}` format | Prefix encodes ownership; gateway validates on history fetch |
| LLM imports | `from backend.models import gemini_flash_model as llm` | All agents use models.py, not direct provider SDKs |
| Schedule naming | `name` field (was `workflow`) | "workflow" was confusing; these are named scheduled agent calls |
| Multi-schedule | `UNIQUE (tenant_id, agent, name)` | Many schedules per agent allowed; name differentiates them |

---

## Known Gaps (non-blocking)

- Cost/token fields may be null for OpenRouter Gemini runs (OpenRouter doesn't always forward usage metadata)
- No Postgres RLS — tenant isolation is application-layer only (acceptable for solo dev; add before onboarding real clients)
- `_estimate_cost()` hardcoded to Gemini 2.5 Flash rate — inaccurate if agents use other models

---

## Context for the Next Agent Session

The harness is done. James's job is now to build agents. The budget-deepagent at
`agents/budget-deepagent/` is the reference pattern.

**Before touching anything**:
- `backend/auth_middleware.py`, admin routes → read `docs/dev-notes/auth-flow.md`
- `backend/db_postgres.py`, `backend/sql/` → read `docs/dev-notes/database.md`
- `frontend/src/` → read `docs/dev-notes/frontend-patterns.md`
- System architecture, run lifecycle, HITL/HOTL → read `docs/system-overview.md`
- Building a new agent → read `docs/deepagents.md` + copy `agents/_template/`

**After testing passes**: push `feat/supabase-auth`, update PR #16 description, merge to `main`.
