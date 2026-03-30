# Supabase Auth + Multi-Tenant Migration Design

**Date:** 2026-03-28
**Branch:** `feat/supabase-auth`
**Status:** Approved

---

## Context

jimmys-agents currently runs as a single-user local tool with SQLite (4 tables), no auth, and
all FastAPI endpoints fully public. The system needs to support multiple tenants — James plus
future clients — where each client has their own isolated set of agents, logs, HITL decisions,
schedules, and agent memory. Supabase provides the auth layer (phone OTP) and Postgres hosting.

---

## Approach: Option B — Supabase Auth + FastAPI owns Postgres

- **Supabase Auth** handles phone OTP login and JWT session management only
- **Next.js** uses `supabase-js` for auth only (login page, session, token refresh)
- **FastAPI** validates Supabase JWTs on every request, extracts `tenant_id`, owns ALL DB reads/writes
- **No RLS** — tenant isolation is enforced in FastAPI query logic, not Postgres policies
- **SQLite replaced** by Supabase-hosted Postgres via `asyncpg`

This preserves existing FastAPI patterns with minimal disruption. Roles are deferred — added
when real client onboarding is needed.

---

## Database Schema

### Auth / Tenancy

```sql
-- Supabase manages auth.users (id, phone, created_at)

CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_tenants (
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  PRIMARY KEY (user_id, tenant_id)
);
```

### Agent Registry

```sql
-- James-maintained master list of available agent implementations
CREATE TABLE agent_registry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT UNIQUE NOT NULL,   -- 'gmail-agent', 'budget-agent', etc.
  display_name      TEXT NOT NULL,
  port              INTEGER NOT NULL,
  accent_color      TEXT,
  is_globally_active BOOLEAN NOT NULL DEFAULT true
);

-- Per-tenant agent instances (which agents a client has been provisioned)
CREATE TABLE tenant_agents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  agent_registry_id UUID NOT NULL REFERENCES agent_registry(id),
  status           TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  archived_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_registry_id)
);
```

### Operational Tables (all tenant-scoped)

```sql
CREATE TABLE hitl_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent       TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE hotl_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent       TEXT NOT NULL,
  run_id      TEXT NOT NULL,
  summary     JSONB NOT NULL,   -- {tools:[{name,params,result}], thoughts:[], overview}
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE run_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent       TEXT NOT NULL,
  run_id      TEXT UNIQUE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'done' | 'error'
  token_count INTEGER DEFAULT 0,
  cost_usd    NUMERIC(10,6) DEFAULT 0,
  error_msg   TEXT
);

CREATE TABLE schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent       TEXT NOT NULL,
  workflow    TEXT NOT NULL DEFAULT 'default',
  cron_expr   TEXT NOT NULL DEFAULT '0 */30 * * *',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  task_prompt TEXT,
  last_run    TIMESTAMPTZ,
  next_run    TIMESTAMPTZ,
  thread_id   TEXT,
  UNIQUE (tenant_id, agent, workflow)
);
```

### Agent Memory (replaces filesystem MEMORY.md / RULES.md)

```sql
-- What the agent has learned about this client (agent-written, client-readable)
CREATE TABLE agent_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent)
);

-- Rules the agent has self-generated (agent-written, client-readable)
CREATE TABLE agent_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  agent       TEXT NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent)
);
```

---

## Three-Layer Ownership Model

Every agent's content is split into three layers with distinct ownership:

```
LAYER 1 — James owns (filesystem, git-controlled, invisible to clients)
├── agent.py                  ← agent implementation, tool definitions
├── skills/SKILL.md           ← base instructions, guardrails, core prompts
└── skills/AGENTS.md          ← base memory seed (starting context)

LAYER 2 — Agent self-writes (Postgres, per-tenant, agent-authored)
├── agent_memory              ← what the agent has learned about this client's context
└── agent_rules               ← rules generated from experience with this client

LAYER 3 — Client configures (Postgres, per-tenant, UI-editable)
├── schedules.task_prompt     ← what to do each scheduled run
├── schedules.cron_expr       ← when to run
└── hitl decisions            ← approve / reject pending actions
```

**Clients** can read Layer 2 (their agent's memory) and edit Layer 3.
**Clients** never see or touch Layer 1.
**James** controls all three layers.

---

## Agent Archival

When `tenant_agents.status` is set to `'archived'`:

- All operational views (`/logs`, `/inbox`, `/stats`, `/schedules`) filter to `status = 'active'` by default
- An "Archived" toggle in the UI reveals historical data
- `agent_registry` remains the global registry — James flips `is_globally_active = false` to retire an agent system-wide without deleting any tenant data
- Thread IDs are namespaced: `thread-{tenant_id}-{agent}-{uuid}` to prevent any cross-tenant state mixing in LangGraph

---

## Auth Flow

### Login

```
/login
  Email input → Supabase sends 6-digit OTP to email (no Twilio, already configured)

/login/verify
  6-digit code input (Geist Mono, auto-focus)
  → Supabase verifies → JWT (access + refresh tokens) issued
  → Stored in httpOnly cookie via supabase-js
  → Redirect to /
```

### Request Flow

```
Every API request:
  Authorization: Bearer <Supabase JWT>

FastAPI auth middleware:
  1. Verify JWT signature against Supabase public key
  2. Extract user_id
  3. SELECT tenant_id FROM user_tenants WHERE user_id = ?
  4. Attach tenant_id to request.state
  5. All DB queries: WHERE tenant_id = request.state.tenant_id
```

### Route Protection

- **Next.js middleware** (`middleware.ts`): checks Supabase session on every request. No session → redirect to `/login`
- **FastAPI**: all endpoints require valid JWT. Missing/invalid → 401
- No role system in MVP. All authenticated users see their own tenant's data only

---

## Frontend Changes

### New Pages
- `/login` — email entry
- `/login/verify` — OTP code entry (6-digit code sent to email)

### LayoutShell Updates
- User pill in sidebar bottom: tenant name + sign out button
- No role badges, no admin links in MVP

### Environment Variables Added
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### FastAPI Environment Variables Added
```
SUPABASE_URL=
SUPABASE_JWT_SECRET=      # for JWT verification
DATABASE_URL=             # Supabase Postgres connection string
```

---

## Migration Steps

Fresh start — no data carried over from SQLite (state.db has < 10 rows total).

```
1.  Create Supabase project via MCP
2.  Enable Phone Auth in Supabase dashboard + configure Twilio
3.  Run schema SQL (all tables above)
4.  Seed agent_registry from agents.yaml
5.  Create James's tenant row manually
6.  Create James's auth.users entry (phone signup) + user_tenants row
7.  Replace backend/db.py: SQLite → asyncpg connecting to Supabase Postgres
8.  Add JWT auth middleware to FastAPI (verify token, attach tenant_id)
9.  Update all FastAPI query functions to filter/insert by tenant_id
10. Replace FilesystemBackend memory reads/writes with agent_memory / agent_rules table ops
11. Add supabase-js to frontend (auth client only)
12. Build /login and /login/verify pages
13. Add Next.js middleware for protected routes
14. Update LayoutShell with user context + sign out
15. Update docs/deepagents.md with 3-layer ownership model
16. Update docs/ag-ui-api.md to reflect tenant_id in all payloads
```

---

## Deferred (Future Phases)

- **Roles** (admin / client / member) — add when real client onboarding begins
- **Client onboarding UI** (`/admin/clients`) — James provisions clients via DB directly for now
- **Cross-tenant admin view** — deferred with roles
- **Realtime subscriptions** — deferred, SSE polling sufficient for now
- **Member invites** — deferred with roles

---

## Verification

1. `make run-api-server` — confirm 401 on all endpoints without JWT
2. `/login` → enter James's phone → receive SMS → enter code → redirect to `/`
3. All dashboard pages load with data scoped to James's tenant
4. Direct DB check: all rows have correct `tenant_id`
5. Agent run → confirm `run_records`, `hotl_logs` written with `tenant_id`
6. Agent memory update → confirm `agent_memory` row upserted, not filesystem write
7. Archiving a `tenant_agent` → confirm it disappears from active views, visible with toggle
