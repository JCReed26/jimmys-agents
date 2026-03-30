# Active State

**Updated**: 2026-03-29
**Branch**: `feat/supabase-auth` → PR #16
**Status**: Ready for E2E testing with James. See `docs/testing-checklist.md`.

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

## Current Focus

**Next**: E2E testing with James. Follow `docs/testing-checklist.md` section by section.

**Agent role during testing**: James performs UI steps. You verify DB state and API logs using
the SQL queries in `docs/testing-checklist.md`. Do not perform steps on James's behalf.

---

## Active Decisions

| Decision | Choice | Reason |
|---|---|---|
| HOTL ownership | Gateway (StreamTranslator), not agent | Keeps agent code clean; harness handles all observability |
| Memory tab content | `skills/AGENTS.md` only | That's what the deepagent actually reads at runtime |
| Admin gating | JAMES_TENANT_ID hardcoded in backend | Simple, no role table needed for a solo-dev system |
| SQL organization | Named query files in `backend/sql/` | Easy to audit what queries exist; no inline SQL |
| Thread IDs | `thread-{tenant_id}-{agent}-{uuid4}` format | Prefix encodes ownership; gateway validates on history fetch |
| LLM imports | `from backend.models import gemini_flash_model as llm` | All agents use models.py, not direct provider SDKs |
| Schedule naming | `name` field (was `workflow`) | "workflow" was confusing; these are named scheduled agent calls |
| Multi-schedule | `UNIQUE (tenant_id, agent, name)` | Many schedules per agent allowed; name differentiates them |

---

## Known Gaps (non-blocking for merge)

- Cost/token fields may be null for OpenRouter Gemini runs (OpenRouter doesn't always forward usage)
- `_proxy_sse` generator has no try/finally — a network drop during a run can leave `runs.status = 'running'`
- `nvidia/llama-nemotron-embed-vl-1b-v2:free` in models.py is an embedding model — swap to `nvidia/llama-3.1-nemotron-70b-instruct:free` for free NVIDIA chat inference

## Security Items — Post-Merge Backlog

From the security review (not blocking, but should be addressed before onboarding clients):

| ID | Fix |
|----|-----|
| C-04 | Add `_require_admin(request)` to `POST /registry/reload` |
| C-03 | Add tenant check to `GET/PUT /agents/{name}/agents-md` |
| I-02 | Add `getServerAccessToken()` to `GET /api/logs/[name]` |
| I-03 | Move `JAMES_TENANT_ID` to env var `ADMIN_TENANT_ID` in `.env` |

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
