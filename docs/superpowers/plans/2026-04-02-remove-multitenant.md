# Remove Multi-Tenant Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strip multi-tenancy from jimmys-agents — removing the tenants/user_tenants/tenant_agents tables and all `tenant_id` scoping — while keeping Supabase JWT auth protecting the single-user instance.

**Architecture:** Bottom-up removal: DB migration → SQL files → db_postgres.py → api_server.py/auth_middleware.py → frontend. Each layer is updated so the service is consistent and startable after each task. The auth middleware is simplified from "validate JWT → resolve tenant" to "validate JWT → set user_id." All data pipelines (schedules, HITL, HOTL, run logs) remain fully functional.

**Tech Stack:** Python 3.13, FastAPI, asyncpg, PostgreSQL (Supabase), Next.js 16 App Router, TypeScript, shadcn/ui

---

## File Map

**Delete:**
- `backend/sql/admin.sql`
- `frontend/src/app/admin/page.tsx`
- `frontend/src/app/api/admin/agents/route.ts`
- `frontend/src/app/api/admin/tenants/route.ts`
- `frontend/src/app/api/admin/users/route.ts`
- `frontend/src/app/profile/page.tsx`

**Create:**
- `backend/migrations/008_remove_multitenant.sql`

**Rewrite (complete file replacement):**
- `backend/sql/agents.sql`
- `backend/sql/hitl.sql`
- `backend/sql/hotl.sql`
- `backend/sql/nav.sql`
- `backend/sql/runs.sql`
- `backend/sql/schedules.sql`
- `backend/auth_middleware.py`

**Modify (targeted edits):**
- `backend/db_postgres.py` — remove tenant_id param from all functions, delete admin section (lines 256–312), remove search helpers, update make_thread_id
- `backend/api_server.py` — remove JAMES_TENANT_ID/admin routes/tenant_id refs, simplify trigger_agent_run/_reload_schedules/_get_live_queue
- `frontend/src/components/layout-shell.tsx` — remove tenantName state, remove Admin + Profile nav links
- `frontend/src/app/api/me/route.ts` — simplify response (no tenant fields)
- `frontend/src/app/page.tsx` — remove "Cost Today" stat card
- `docs/dev-notes/auth-flow.md` — update auth decision tree
- `docs/dev-notes/database.md` — update schema section
- `docs/dev-notes/active-state.md` — update active state
- `CLAUDE.md` (project) — update active rules section

---

## Task 1: Write DB Migration

**Files:**
- Create: `backend/migrations/008_remove_multitenant.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 008_remove_multitenant.sql
-- Removes multi-tenant architecture. Single-user system: no tenants, user_tenants, or tenant_agents.

BEGIN;

-- Drop tenant mapping tables (CASCADE removes FK constraints on dependent tables)
DROP TABLE IF EXISTS tenant_agents CASCADE;
DROP TABLE IF EXISTS user_tenants CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Drop tenant_id column from all runtime tables
ALTER TABLE hitl_items DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE hotl_logs DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE run_records DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE schedules DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE agent_memory DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE agent_rules DROP COLUMN IF EXISTS tenant_id;

-- Rename tenant_agent_configs → agent_configs (no tenant scope)
ALTER TABLE tenant_agent_configs RENAME TO agent_configs;
ALTER TABLE agent_configs DROP COLUMN IF EXISTS tenant_id;

-- Drop old tenant-scoped indexes
DROP INDEX IF EXISTS idx_hitl_tenant_status;
DROP INDEX IF EXISTS idx_hitl_tenant_agent;
DROP INDEX IF EXISTS idx_hotl_tenant_read;
DROP INDEX IF EXISTS idx_hotl_tenant_agent;
DROP INDEX IF EXISTS idx_runs_tenant_agent;
DROP INDEX IF EXISTS idx_schedules_tenant_agent;
DROP INDEX IF EXISTS idx_tenant_agent_configs;

-- Drop old unique constraints that included tenant_id, re-add without it
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_tenant_id_agent_name_key;
ALTER TABLE schedules ADD UNIQUE (agent, name);

ALTER TABLE agent_memory DROP CONSTRAINT IF EXISTS agent_memory_tenant_id_agent_key;
ALTER TABLE agent_memory ADD UNIQUE (agent);

ALTER TABLE agent_rules DROP CONSTRAINT IF EXISTS agent_rules_tenant_id_agent_key;
ALTER TABLE agent_rules ADD UNIQUE (agent);

ALTER TABLE agent_configs DROP CONSTRAINT IF EXISTS tenant_agent_configs_tenant_id_agent_key;
ALTER TABLE agent_configs ADD UNIQUE (agent);

-- Re-add useful indexes (without tenant scope)
CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_items(status);
CREATE INDEX IF NOT EXISTS idx_hitl_agent ON hitl_items(agent);
CREATE INDEX IF NOT EXISTS idx_hotl_read ON hotl_logs(is_read);
CREATE INDEX IF NOT EXISTS idx_hotl_agent ON hotl_logs(agent);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON run_records(agent);
CREATE INDEX IF NOT EXISTS idx_schedules_agent ON schedules(agent);

COMMIT;
```

- [ ] **Step 2: Pre-migration — verify current schema via Supabase MCP**

Before applying, use `mcp__claude_ai_Supabase__execute_sql` to confirm the constraint names that will be dropped:

```sql
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'schedules'::regclass,
  'agent_memory'::regclass,
  'agent_rules'::regclass,
  'tenant_agent_configs'::regclass
)
ORDER BY conrelid::text, conname;
```

Also confirm the table `tenant_agent_configs` exists (it gets renamed):
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
ORDER BY table_name;
```

Adjust DROP CONSTRAINT names in the migration file if they differ from `*_tenant_id_agent*_key`.

- [ ] **Step 3: Apply the migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with name `008_remove_multitenant` and the SQL content from Step 1.

- [ ] **Step 4: Verify schema post-migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__execute_sql` to confirm:

```sql
-- Should return NO rows for tenant_id column in these tables
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema='public'
  AND column_name='tenant_id'
ORDER BY table_name;
```

```sql
-- Confirm tenant tables are gone
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('tenants','user_tenants','tenant_agents')
ORDER BY table_name;
-- Expected: 0 rows
```

```sql
-- Confirm agent_configs table exists (renamed from tenant_agent_configs)
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name='agent_configs';
-- Expected: 1 row
```

```sql
-- Confirm new unique constraints
SELECT conname FROM pg_constraint
WHERE conrelid IN (
  'schedules'::regclass,
  'agent_memory'::regclass,
  'agent_rules'::regclass,
  'agent_configs'::regclass
)
AND contype='u'
ORDER BY conname;
-- Expected: schedules_agent_name_key, agent_memory_agent_key, etc.
```

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/008_remove_multitenant.sql
git commit -m "db: migration 008 — remove multi-tenant schema"
```

---

## Task 2: Rewrite SQL Files

**Files:**
- Rewrite: `backend/sql/agents.sql`
- Rewrite: `backend/sql/hitl.sql`
- Rewrite: `backend/sql/hotl.sql`
- Rewrite: `backend/sql/nav.sql`
- Rewrite: `backend/sql/runs.sql`
- Rewrite: `backend/sql/schedules.sql`
- Delete: `backend/sql/admin.sql`

- [ ] **Step 1: Delete admin.sql**

```bash
rm backend/sql/admin.sql
```

- [ ] **Step 2: Rewrite agents.sql**

```sql
-- name: list_active_agents
SELECT name, display_name, port, accent_color
FROM agent_registry
WHERE is_globally_active=true
ORDER BY port

-- name: get_agent_memory
SELECT content FROM agent_memory WHERE agent=$1

-- name: upsert_agent_memory
INSERT INTO agent_memory (agent, content, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (agent) DO UPDATE SET content=$2, updated_at=now()

-- name: get_agent_rules
SELECT content FROM agent_rules WHERE agent=$1

-- name: upsert_agent_rules
INSERT INTO agent_rules (agent, content, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (agent) DO UPDATE SET content=$2, updated_at=now()

-- name: get_agent_config
SELECT config FROM agent_configs WHERE agent=$1

-- name: upsert_agent_config
INSERT INTO agent_configs (agent, config, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (agent)
DO UPDATE SET config=$2, updated_at=now()
RETURNING config

-- For global search:
-- name: search_memory
SELECT agent, content FROM agent_memory

-- name: search_rules
SELECT agent, content FROM agent_rules
```

- [ ] **Step 3: Rewrite hitl.sql**

```sql
-- name: get_item
SELECT * FROM hitl_items WHERE id=$1

-- name: create_item
INSERT INTO hitl_items (agent, item_type, payload, created_at)
VALUES ($1, $2, $3, $4)
RETURNING *

-- name: resolve_item
UPDATE hitl_items
SET status=$1, comment=$2, resolved_at=$3
WHERE id=$4
RETURNING *

-- Dynamic list query base (filters appended in Python):
-- name: list_base
SELECT * FROM hitl_items WHERE true
```

- [ ] **Step 4: Rewrite hotl.sql**

```sql
-- name: create_log
INSERT INTO hotl_logs (agent, run_id, summary, cost_usd, total_tokens, langsmith_run_id, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *

-- name: mark_read
UPDATE hotl_logs SET is_read=true WHERE id=$1

-- name: mark_all_read
UPDATE hotl_logs SET is_read=true

-- name: mark_all_read_by_agent
UPDATE hotl_logs SET is_read=true WHERE agent=$1

-- name: clear_logs
DELETE FROM hotl_logs

-- Dynamic list query base (filters appended in Python):
-- name: list_base
SELECT * FROM hotl_logs WHERE true
```

- [ ] **Step 5: Rewrite nav.sql**

```sql
-- name: nav_counts
SELECT
  (SELECT COUNT(*) FROM hitl_items WHERE status='pending') AS hitl,
  (SELECT COUNT(*) FROM hotl_logs  WHERE is_read=false)    AS hotl_unread
```

- [ ] **Step 6: Rewrite runs.sql**

```sql
-- name: start_run
INSERT INTO run_records (agent, run_id, started_at)
VALUES ($1, $2, $3)
RETURNING *

-- name: finish_run
UPDATE run_records
SET finished_at=$1, status=$2, token_count=$3, cost_usd=$4, error_msg=$5
WHERE run_id=$6
RETURNING *

-- name: list_for_agent
SELECT id, status, cost_usd, token_count AS total_tokens,
       started_at, finished_at AS ended_at, run_id AS langsmith_run_id
FROM run_records
WHERE agent=$1
ORDER BY started_at DESC
LIMIT $2

-- name: stats_by_agent
SELECT agent,
       COUNT(*)                      AS runs,
       COALESCE(SUM(token_count), 0) AS tokens,
       COALESCE(SUM(cost_usd), 0)    AS cost
FROM run_records
GROUP BY agent

-- For agents status page (last 100 runs, all agents):
-- name: list_recent
SELECT id, agent, status, started_at, cost_usd, token_count, error_msg
FROM run_records ORDER BY started_at DESC LIMIT 100

-- Dynamic list query base (filters appended in Python):
-- name: list_base
SELECT * FROM run_records WHERE true
```

- [ ] **Step 7: Rewrite schedules.sql**

```sql
-- name: upsert
INSERT INTO schedules (agent, name, cron_expr, enabled, task_prompt, thread_id)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (agent, name)
DO UPDATE SET cron_expr=$3, enabled=$4, task_prompt=$5,
              thread_id=COALESCE(schedules.thread_id, $6)
RETURNING *

-- name: delete
DELETE FROM schedules WHERE agent=$1 AND name=$2

-- name: list_all
SELECT * FROM schedules

-- name: list_by_agent
SELECT * FROM schedules WHERE agent=$1

-- name: load_all_enabled
SELECT * FROM schedules WHERE enabled=true

-- name: set_enabled
UPDATE schedules SET enabled=$1 WHERE agent=$2 AND name=$3

-- Load all schedules (scheduler reads all, checks enabled in Python):
-- name: load_all
SELECT agent, name, cron_expr, enabled, task_prompt, thread_id::text FROM schedules
```

- [ ] **Step 8: Commit**

```bash
git add backend/sql/
git commit -m "db: rewrite all SQL queries to remove tenant_id scoping"
```

---

## Task 3: Rewrite auth_middleware.py

**Files:**
- Rewrite: `backend/auth_middleware.py`

- [ ] **Step 1: Replace the file**

```python
import os
from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt, JWTError

SKIP_PATHS = {"/ok", "/docs", "/openapi.json", "/redoc"}

# Internal key bypass: agents posting HOTL logs or HITL requests don't carry a JWT.
# Applies to POST /hotl and POST /hitl. Disabled entirely if INTERNAL_API_KEY is unset.
_INTERNAL_BYPASS_PATHS = {"/hotl", "/hitl"}
_INTERNAL_BYPASS_METHOD = "POST"


def _get_internal_api_key() -> str:
    return os.environ.get("INTERNAL_API_KEY", "")


def validate_env() -> None:
    """Call during app startup to fail fast if required vars are missing."""
    if not os.environ.get("SUPABASE_JWT_SECRET"):
        raise RuntimeError("SUPABASE_JWT_SECRET env var is not set")
    if not os.environ.get("SUPABASE_URL"):
        raise RuntimeError("SUPABASE_URL env var is not set")


def _get_jwt_secret() -> str:
    return os.environ["SUPABASE_JWT_SECRET"]


def _get_issuer() -> str:
    """Supabase JWT issuer — prevents tokens from other Supabase projects being accepted."""
    url = os.environ.get("SUPABASE_URL", "")
    return f"{url}/auth/v1" if url else ""


async def auth_middleware(request: Request, call_next):
    if request.url.path in SKIP_PATHS:
        return await call_next(request)

    # Internal agent bypass: POST /hotl and POST /hitl, only when INTERNAL_API_KEY is configured.
    internal_key = _get_internal_api_key()
    if (
        internal_key
        and request.method == _INTERNAL_BYPASS_METHOD
        and request.url.path in _INTERNAL_BYPASS_PATHS
    ):
        provided = request.headers.get("X-Internal-Key", "")
        if provided == internal_key:
            request.state.user_id = "internal"
            return await call_next(request)
        # Key was provided but wrong — fail immediately (don't fall through to JWT)
        return JSONResponse(status_code=401, content={"detail": "Invalid internal key"})

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Missing auth token"})

    token = auth_header.removeprefix("Bearer ").strip()

    try:
        issuer = _get_issuer()
        payload = jwt.decode(
            token,
            _get_jwt_secret(),
            algorithms=["HS256"],
            audience="authenticated",
            issuer=issuer,
            options={"verify_iss": True},
        )
    except JWTError:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})

    user_id = payload.get("sub")
    if not user_id:
        return JSONResponse(status_code=401, content={"detail": "Token missing sub claim"})

    request.state.user_id = user_id
    return await call_next(request)
```

- [ ] **Step 2: Commit**

```bash
git add backend/auth_middleware.py
git commit -m "auth: simplify middleware — validate JWT, set user_id only (no tenant lookup)"
```

---

## Task 4: Update db_postgres.py

**Files:**
- Modify: `backend/db_postgres.py`

This is the most mechanically intensive task. Every function loses `tenant_id` as a parameter, and the admin section (lines 256–333) is deleted entirely.

- [ ] **Step 1: Replace the full file**

```python
"""
Postgres DB layer for jimmys-agents.
Single-user system: no tenant_id scoping. All functions require conn (asyncpg connection).

SQL strings are loaded from backend/sql/*.sql via sql_loader.
"""
import json
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

from backend.sql_loader import load_sql


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_thread_id(agent: str) -> str:
    """Generate a namespaced thread ID for LangGraph."""
    return f"thread-{agent}-{_uuid.uuid4().hex}"


# ── Nav counts ────────────────────────────────────────────────────────────────

async def get_nav_counts(conn) -> dict:
    Q = load_sql("nav")
    row = await conn.fetchrow(Q["nav_counts"])
    return {"hitl": row["hitl"], "hotlUnread": row["hotl_unread"]}


# ── HITL ──────────────────────────────────────────────────────────────────────

async def list_hitl_items(conn, status: Optional[str] = None, agent: Optional[str] = None) -> list:
    Q = load_sql("hitl")
    query = Q["list_base"]
    params: list = []
    if status:
        params.append(status)
        query += f" AND status=${len(params)}"
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    query += " ORDER BY created_at DESC LIMIT 200"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def get_hitl_item(conn, item_id: str) -> Optional[dict]:
    Q = load_sql("hitl")
    row = await conn.fetchrow(Q["get_item"], item_id)
    return dict(row) if row else None


async def create_hitl_item(conn, agent: str, item_type: str, payload: dict) -> dict:
    Q = load_sql("hitl")
    row = await conn.fetchrow(Q["create_item"], agent, item_type, json.dumps(payload), _now())
    return dict(row)


async def resolve_hitl_item(conn, item_id: str, status: str, comment: Optional[str] = None) -> Optional[dict]:
    Q = load_sql("hitl")
    row = await conn.fetchrow(Q["resolve_item"], status, comment, _now(), item_id)
    return dict(row) if row else None


# ── HOTL ──────────────────────────────────────────────────────────────────────

async def list_hotl_logs(conn, agent: Optional[str] = None, unread_only: bool = False, limit: int = 50) -> list:
    Q = load_sql("hotl")
    query = Q["list_base"]
    params: list = []
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    if unread_only:
        query += " AND is_read=false"
    query += f" ORDER BY created_at DESC LIMIT {min(limit, 200)}"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def create_hotl_log(
    conn,
    agent: str,
    run_id: str,
    summary: dict,
    cost_usd: Optional[float] = None,
    total_tokens: Optional[int] = None,
    langsmith_run_id: Optional[str] = None,
) -> dict:
    Q = load_sql("hotl")
    row = await conn.fetchrow(
        Q["create_log"],
        agent, run_id, json.dumps(summary), cost_usd, total_tokens, langsmith_run_id, _now(),
    )
    return dict(row)


async def mark_hotl_read(conn, log_id: str) -> None:
    Q = load_sql("hotl")
    await conn.execute(Q["mark_read"], log_id)


async def mark_all_hotl_read(conn, agent: Optional[str] = None) -> None:
    Q = load_sql("hotl")
    if agent:
        await conn.execute(Q["mark_all_read_by_agent"], agent)
    else:
        await conn.execute(Q["mark_all_read"])


async def clear_hotl_logs(conn) -> None:
    Q = load_sql("hotl")
    await conn.execute(Q["clear_logs"])


# ── Run records ───────────────────────────────────────────────────────────────

async def list_runs_for_agent(conn, agent_name: str, limit: int = 20) -> list:
    Q = load_sql("runs")
    rows = await conn.fetch(Q["list_for_agent"], agent_name, min(limit, 100))
    return [dict(r) for r in rows]


async def list_runs(conn, agent: Optional[str] = None, limit: int = 50) -> list:
    Q = load_sql("runs")
    query = Q["list_base"]
    params: list = []
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    query += f" ORDER BY started_at DESC LIMIT {min(limit, 200)}"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def start_run(conn, agent: str, run_id: str) -> dict:
    Q = load_sql("runs")
    row = await conn.fetchrow(Q["start_run"], agent, run_id, _now())
    return dict(row)


async def finish_run(conn, run_id: str, status: str, token_count: int = 0, cost_usd: float = 0.0, error_msg: Optional[str] = None) -> Optional[dict]:
    Q = load_sql("runs")
    row = await conn.fetchrow(Q["finish_run"], _now(), status, token_count, cost_usd, error_msg, run_id)
    return dict(row) if row else None


# ── Schedules ─────────────────────────────────────────────────────────────────

async def list_schedules(conn, agent: Optional[str] = None) -> list:
    Q = load_sql("schedules")
    if agent:
        rows = await conn.fetch(Q["list_by_agent"], agent)
    else:
        rows = await conn.fetch(Q["list_all"])
    return [dict(r) for r in rows]


async def upsert_schedule(conn, agent: str, name: str, cron_expr: str, enabled: bool, task_prompt: Optional[str], thread_id: Optional[str] = None) -> dict:
    if thread_id is None:
        thread_id = make_thread_id(agent)
    Q = load_sql("schedules")
    row = await conn.fetchrow(Q["upsert"], agent, name, cron_expr, enabled, task_prompt, thread_id)
    return dict(row)


async def delete_schedule(conn, agent: str, name: str) -> None:
    Q = load_sql("schedules")
    await conn.execute(Q["delete"], agent, name)


# ── Stats ─────────────────────────────────────────────────────────────────────

async def get_stats(conn) -> dict:
    Q = load_sql("runs")
    rows = await conn.fetch(Q["stats_by_agent"])
    by_agent = {
        r["agent"]: {"runs": r["runs"], "tokens": r["tokens"], "cost": float(r["cost"])}
        for r in rows
    }
    return {
        "total_runs":   sum(v["runs"]   for v in by_agent.values()),
        "total_tokens": sum(v["tokens"] for v in by_agent.values()),
        "total_cost":   sum(v["cost"]   for v in by_agent.values()),
        "by_agent": by_agent,
    }


# ── Agent memory / rules ──────────────────────────────────────────────────────

async def get_agent_memory(conn, agent: str) -> str:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["get_agent_memory"], agent)
    return row["content"] if row else ""


async def upsert_agent_memory(conn, agent: str, content: str) -> None:
    Q = load_sql("agents")
    await conn.execute(Q["upsert_agent_memory"], agent, content)


async def get_agent_rules(conn, agent: str) -> str:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["get_agent_rules"], agent)
    return row["content"] if row else ""


async def upsert_agent_rules(conn, agent: str, content: str) -> None:
    Q = load_sql("agents")
    await conn.execute(Q["upsert_agent_rules"], agent, content)


# ── Active agents ─────────────────────────────────────────────────────────────

async def list_active_agents(conn) -> list:
    Q = load_sql("agents")
    rows = await conn.fetch(Q["list_active_agents"])
    return [dict(r) for r in rows]


# ── Agent configs ─────────────────────────────────────────────────────────────

async def get_agent_config(conn, agent: str) -> dict:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["get_agent_config"], agent)
    if row and row["config"]:
        config = row["config"]
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except Exception:
                config = {}
        return config
    return {}


async def upsert_agent_config(conn, agent: str, config: dict) -> dict:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["upsert_agent_config"], agent, json.dumps(config))
    if row and row["config"]:
        res_config = row["config"]
        if isinstance(res_config, str):
            try:
                res_config = json.loads(res_config)
            except Exception:
                res_config = {}
        return res_config
    return {}


# ── Search helpers ────────────────────────────────────────────────────────────

async def search_agent_memory(conn) -> list:
    Q = load_sql("agents")
    rows = await conn.fetch(Q["search_memory"])
    return [dict(r) for r in rows]


async def search_agent_rules(conn) -> list:
    Q = load_sql("agents")
    rows = await conn.fetch(Q["search_rules"])
    return [dict(r) for r in rows]


async def list_recent_runs(conn) -> list:
    Q = load_sql("runs")
    rows = await conn.fetch(Q["list_recent"])
    return [dict(r) for r in rows]
```

- [ ] **Step 2: Commit**

```bash
git add backend/db_postgres.py
git commit -m "db: remove tenant_id from all db_postgres functions, delete admin helpers"
```

---

## Task 5: Update api_server.py

**Files:**
- Modify: `backend/api_server.py`

Make these targeted edits (read the file first to confirm line numbers before editing):

- [ ] **Step 1: Update module docstring (line 9)**

Change:
```python
- JWT auth via Supabase — tenant_id extracted from token, all queries tenant-scoped
```
To:
```python
- JWT auth via Supabase — user_id extracted from token, single-user instance
```

- [ ] **Step 2: Update trigger_agent_run — remove tenant_id param (lines 62–137)**

Replace the function signature and body. Key changes:
- Remove `tenant_id: str` parameter
- Replace all `tenant_id` args in db calls with nothing
- Replace `db.make_thread_id(tenant_id, agent)` → `db.make_thread_id(agent)`
- Replace `_publish_live(tenant_id, agent, ...)` → `_publish_live(agent, ...)`

```python
async def trigger_agent_run(
    agent: str,
    task_prompt: str | None = None,
    thread_id: str | None = None,
):
    """
    Fire a LangGraph /runs/stream call for scheduled runs.
    Translates to AG-UI, publishes to live queue, writes HOTL on completion.
    """
    global _pool
    run_id = str(uuid.uuid4())

    async with _pool.acquire() as conn:
        await db.start_run(conn, agent, run_id)

    agent_cfg = registry.get(agent)
    if not agent_cfg or not agent_cfg.enabled:
        async with _pool.acquire() as conn:
            await db.finish_run(conn, run_id, "error", error_msg="Agent not registered or disabled")
        return

    if thread_id is None:
        thread_id = db.make_thread_id(agent)

    prompt = task_prompt or "Run your scheduled task."
    lg_payload = {
        "assistant_id": "agent",
        "input": {"messages": [{"role": "user", "content": prompt}]},
        "config": {"configurable": {"thread_id": thread_id}},
        "stream_mode": ["messages"],
    }

    translator = StreamTranslator(run_id=run_id, thread_id=thread_id)
    _publish_live(agent, translator.start())

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{registry.base_url(agent)}/runs/stream",
                json=lg_payload,
                headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            ) as resp:
                resp.raise_for_status()

                current_event_type = "messages/partial"
                async for line in resp.aiter_lines():
                    if line.startswith("event: "):
                        current_event_type = line[7:].strip()
                    elif line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        for ag_ui_line in translator.feed(current_event_type, data):
                            _publish_live(agent, ag_ui_line)

        for ag_ui_line in translator.finish():
            _publish_live(agent, ag_ui_line)

        usage = translator.usage_metadata or {}
        token_count = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        cost_usd = _estimate_cost(token_count)
        async with _pool.acquire() as conn:
            await db.finish_run(conn, run_id, "done", token_count=token_count, cost_usd=cost_usd)
            await db.create_hotl_log(
                conn, agent, run_id, translator.hotl_summary,
                cost_usd=cost_usd, total_tokens=token_count,
            )

    except Exception as e:
        async with _pool.acquire() as conn:
            await db.finish_run(conn, run_id, "error", error_msg=str(e))
        _publish_live(agent, translator.error(str(e)))
```

- [ ] **Step 3: Update _reload_schedules — remove tenant_id from job_id and set_enabled call**

In `_reload_schedules` (around line 140):

Change:
```python
job_id = f"agent_{row['tenant_id']}_{row['agent']}_{row['name']}"
```
To:
```python
job_id = f"agent_{row['agent']}_{row['name']}"
```

Change the `scheduler.add_job` kwargs block from:
```python
kwargs={
    "tenant_id": row["tenant_id"],
    "agent": row["agent"],
    "task_prompt": row.get("task_prompt"),
    "thread_id": row.get("thread_id"),
},
```
To:
```python
kwargs={
    "agent": row["agent"],
    "task_prompt": row.get("task_prompt"),
    "thread_id": row.get("thread_id"),
},
```

Change the `set_enabled` call from:
```python
await conn.execute(
    _SCHED_SQL["set_enabled"],
    row["enabled"], row["tenant_id"], row["agent"], row["name"],
)
```
To:
```python
await conn.execute(
    _SCHED_SQL["set_enabled"],
    row["enabled"], row["agent"], row["name"],
)
```

- [ ] **Step 4: Update _get_live_queue and _publish_live — remove tenant scope**

Change:
```python
def _get_live_queue(tenant_id: str, agent: str) -> asyncio.Queue:
    key = f"{tenant_id}:{agent}"
    if key not in _live_queues:
        _live_queues[key] = asyncio.Queue(maxsize=500)
    return _live_queues[key]


def _publish_live(tenant_id: str, agent: str, event_line: str) -> None:
    """Non-blocking put to tenant-scoped live queue. Silently drops if full."""
    q = _get_live_queue(tenant_id, agent)
    try:
        q.put_nowait(event_line)
    except asyncio.QueueFull:
        pass
```
To:
```python
def _get_live_queue(agent: str) -> asyncio.Queue:
    if agent not in _live_queues:
        _live_queues[agent] = asyncio.Queue(maxsize=500)
    return _live_queues[agent]


def _publish_live(agent: str, event_line: str) -> None:
    """Non-blocking put to live queue. Silently drops if full."""
    q = _get_live_queue(agent)
    try:
        q.put_nowait(event_line)
    except asyncio.QueueFull:
        pass
```

- [ ] **Step 5: Update /me endpoint**

Change:
```python
@app.get("/me")
async def get_me(request: Request):
    async with request.app.state.pool.acquire() as conn:
        tenant_name = await db.get_tenant_name(conn, request.state.tenant_id)
    return {
        "tenant_id": request.state.tenant_id,
        "user_id": request.state.user_id,
        "tenant_name": tenant_name,
    }
```
To:
```python
@app.get("/me")
async def get_me(request: Request):
    return {"user_id": request.state.user_id}
```

- [ ] **Step 6: Update /nav-counts**

Change:
```python
return await db.get_nav_counts(conn, request.state.tenant_id)
```
To:
```python
return await db.get_nav_counts(conn)
```

- [ ] **Step 7: Update /agents endpoint — use list_active_agents**

Change:
```python
tenant_id = request.state.tenant_id

async with request.app.state.pool.acquire() as conn:
    tenant_agents = await db.list_tenant_agents(conn, tenant_id)
    schedules = await db.list_schedules(conn, tenant_id)
    hitl_pending = await db.list_hitl_items(conn, tenant_id, status="pending")
    ...
    runs = await db.list_recent_runs(conn, tenant_id)
```
To:
```python
async with request.app.state.pool.acquire() as conn:
    active_agents = await db.list_active_agents(conn)
    schedules = await db.list_schedules(conn)
    hitl_pending = await db.list_hitl_items(conn, status="pending")
    ...
    runs = await db.list_recent_runs(conn)
```

Also change the loop from `for agent in tenant_agents:` to `for agent in active_agents:`.

- [ ] **Step 8: Update _proxy_sse — remove tenant_id**

In `_proxy_sse` (line 358), change signature:
```python
async def _proxy_sse(agent_name: str, request: Request) -> AsyncIterator[str]:
```

Remove all `tenant_id` variables from the function body:
- `await db.start_run(conn, agent_name, run_id)`
- `thread_id = req_data.get("thread_id") or db.make_thread_id(agent_name)`
- `await db.finish_run(conn, run_id, "done", ...)`
- `await db.create_hotl_log(conn, agent_name, run_id, ...)`
- `await db.finish_run(conn, run_id, "error", ...)`
- `await db.finish_run(conn, run_id, "interrupted")`

In the `agent_run` endpoint, change the StreamingResponse call from:
```python
_proxy_sse(name, request.state.tenant_id, request)
```
To:
```python
_proxy_sse(name, request)
```

- [ ] **Step 9: Update /sse/{agent}/live**

Change:
```python
q = _get_live_queue(request.state.tenant_id, agent)
```
To:
```python
q = _get_live_queue(agent)
```

- [ ] **Step 10: Update /chat/{agent}/history — fix thread_id validation**

Change:
```python
tenant_id = request.state.tenant_id
if not thread_id.startswith(f"thread-{tenant_id}-"):
    return {"messages": []}
```
To:
```python
if not thread_id.startswith(f"thread-{agent}-"):
    return {"messages": []}
```

- [ ] **Step 11: Update all HITL routes — remove tenant_id arg**

```python
# list_hitl
return await db.list_hitl_items(conn, status=status, agent=agent)

# create_hitl
item = await db.create_hitl_item(conn, req.agent, req.item_type, req.payload)

# get_hitl
item = await db.get_hitl_item(conn, item_id)

# resolve_hitl
result = await db.resolve_hitl_item(conn, item_id, req.decision, req.comment)
```

- [ ] **Step 12: Update all HOTL routes — remove tenant_id**

Remove `JAMES_TENANT_ID` constant and the internal-key tenant resolution block in `create_hotl`. The internal key bypass still works (auth_middleware sets `user_id = "internal"`); we just no longer need to resolve a tenant.

```python
@app.get("/hotl")
async def list_hotl(request: Request, agent: str | None = None, unread_only: bool = False):
    async with request.app.state.pool.acquire() as conn:
        return await db.list_hotl_logs(conn, agent=agent, unread_only=unread_only)


@app.post("/hotl")
async def create_hotl(req: HotlCreateRequest, request: Request):
    agent_name = req.agent_name or req.agent or "unknown"

    if req.summary is not None:
        summary = req.summary
    else:
        summary = {
            "overview": req.overview or "",
            "tools": req.tools or [],
            "thoughts": req.thoughts or "",
        }

    async with request.app.state.pool.acquire() as conn:
        log = await db.create_hotl_log(
            conn,
            agent_name,
            req.run_id or str(uuid.uuid4()),
            summary,
            cost_usd=req.cost_usd,
            total_tokens=req.total_tokens,
            langsmith_run_id=req.langsmith_run_id,
        )
    return {"id": str(log["id"])}


@app.post("/hotl/clear")
async def clear_hotl(request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.clear_hotl_logs(conn)
    return {"ok": True}


@app.post("/hotl/read-all")
async def mark_all_hotl_read(request: Request, agent: str | None = None):
    async with request.app.state.pool.acquire() as conn:
        await db.mark_all_hotl_read(conn, agent=agent)
    return {"ok": True}


@app.post("/hotl/{log_id}/read")
async def mark_hotl_read(log_id: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.mark_hotl_read(conn, log_id)
    return {"ok": True}
```

- [ ] **Step 13: Update runs routes**

```python
@app.get("/runs")
async def list_runs(request: Request, agent: str | None = None, limit: int = 20):
    limit = min(limit, 100)
    async with request.app.state.pool.acquire() as conn:
        if agent:
            return await db.list_runs_for_agent(conn, agent, limit=limit)
        return await db.list_runs(conn, limit=limit)


@app.post("/runs/start")
async def start_run_endpoint(agent: str, run_id: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.start_run(conn, agent, run_id)
    return {"ok": True}


@app.post("/runs/{run_id}/finish")
async def finish_run_endpoint(run_id: str, req: RunFinishRequest, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.finish_run(conn, run_id, req.status, req.token_count, req.cost_usd, req.error_msg)
    return {"ok": True}
```

- [ ] **Step 14: Update schedules routes**

```python
@app.get("/schedules")
async def list_schedules_endpoint(request: Request):
    async with request.app.state.pool.acquire() as conn:
        return await db.list_schedules(conn)


@app.post("/schedules")
async def upsert_schedule_endpoint(req: ScheduleUpsertRequest, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.upsert_schedule(conn, req.agent, req.name, req.cron_expr, req.enabled, req.task_prompt or None)
    await _reload_schedules()
    return {"ok": True}


@app.delete("/schedules/{agent}/{name}")
async def delete_schedule_endpoint(agent: str, name: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.delete_schedule(conn, agent, name)
    await _reload_schedules()
    return {"ok": True}


@app.post("/schedules/{agent}/trigger")
async def manual_trigger(agent: str, request: Request, name: str = "default"):
    async with request.app.state.pool.acquire() as conn:
        rows = await db.list_schedules(conn, agent=agent)
    sched = next((r for r in rows if r["name"] == name), None)
    prompt = sched["task_prompt"] if sched else None
    thread_id = str(sched["thread_id"]) if sched and sched.get("thread_id") else None
    asyncio.create_task(trigger_agent_run(agent, prompt, thread_id))
    return {"ok": True, "message": f"Triggered {agent}/{name}"}
```

- [ ] **Step 15: Update agents-md routes — simplify _check_agent_access**

Replace `_check_agent_access` with a simple registry check (no DB needed):

```python
async def _check_agent_access(name: str, request: Request) -> None:
    """Raise 404 if agent is not in registry — already checked by callers, kept for safety."""
    pass  # registry check already done by caller
```

Or simply delete `_check_agent_access` entirely and remove its two call sites (the registry.get check just above already provides protection).

- [ ] **Step 16: Update /stats**

```python
@app.get("/stats")
async def get_stats(request: Request):
    async with request.app.state.pool.acquire() as conn:
        return await db.get_stats(conn)
```

- [ ] **Step 17: Update /search**

```python
async with request.app.state.pool.acquire() as conn:
    hotl_logs = await db.list_hotl_logs(conn, limit=200)
    hitl_items = await db.list_hitl_items(conn)
    memory_rows = await db.search_agent_memory(conn)
    rules_rows = await db.search_agent_rules(conn)
```

- [ ] **Step 18: Delete all admin routes and helpers**

Delete from api_server.py:
- `JAMES_TENANT_ID = os.getenv(...)` constant
- `serialize()` function
- `_require_admin()` function
- `/registry/reload` still needs `_require_admin` removed — make it accessible (it's a simple reload, protected by auth already)
- All 8 `@app.get/post/delete("/admin/...")` route handlers

For `/registry/reload`, change:
```python
@app.post("/registry/reload")
async def reload_registry(request: Request):
    """Hot-reload agents.yaml without restarting the server. Admin only."""
    _require_admin(request)
    registry.reload()
    await _reload_schedules()
    return {
        "ok": True,
        "agents": [a.name for a in registry.get_all()],
    }
```
To:
```python
@app.post("/registry/reload")
async def reload_registry(request: Request):
    """Hot-reload agents.yaml without restarting the server."""
    registry.reload()
    await _reload_schedules()
    return {
        "ok": True,
        "agents": [a.name for a in registry.get_all()],
    }
```

- [ ] **Step 19: Verify backend starts**

```bash
cd /path/to/jimmys-agents && make run-api-server
```

Expected: server starts on :8080 with no import errors or startup exceptions.

```bash
curl http://localhost:8080/ok
# Expected: {"ok":true}

curl -H "Authorization: Bearer <valid_jwt>" http://localhost:8080/nav-counts
# Expected: {"hitl": N, "hotlUnread": N}

curl -H "Authorization: Bearer <valid_jwt>" http://localhost:8080/agents
# Expected: JSON object with agent statuses
```

- [ ] **Step 20: Commit**

```bash
git add backend/api_server.py
git commit -m "api: remove tenant_id from all routes, delete admin endpoints, simplify scheduler and live queues"
```

---

## Task 6: Delete Frontend Admin and Profile Pages

**Files:**
- Delete: `frontend/src/app/admin/page.tsx`
- Delete: `frontend/src/app/api/admin/agents/route.ts`
- Delete: `frontend/src/app/api/admin/tenants/route.ts`
- Delete: `frontend/src/app/api/admin/users/route.ts`
- Delete: `frontend/src/app/profile/page.tsx`

- [ ] **Step 1: Delete the files**

```bash
rm frontend/src/app/admin/page.tsx
rm -r frontend/src/app/api/admin/
rm frontend/src/app/profile/page.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -A frontend/src/app/admin/ frontend/src/app/api/admin/ frontend/src/app/profile/
git commit -m "frontend: delete admin page, admin API routes, and profile page"
```

---

## Task 7: Update Frontend Shell, /me Route, and Dashboard

**Files:**
- Modify: `frontend/src/components/layout-shell.tsx`
- Modify: `frontend/src/app/api/me/route.ts`
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Update layout-shell.tsx**

Three changes:

**a) Remove `Shield` from lucide imports and `tenantName` state:**

Change the imports line from:
```tsx
import {
  Mail, Calendar, DollarSign, GitBranch,
  LayoutDashboard, Inbox, ScrollText, Activity,
  CalendarClock, Settings, User, ChevronRight,
  Zap, BarChart3, PanelLeft, LogOut, Shield,
} from "lucide-react";
```
To:
```tsx
import {
  Mail, Calendar, DollarSign, GitBranch,
  LayoutDashboard, Inbox, ScrollText, Activity,
  CalendarClock, Settings, ChevronRight,
  Zap, BarChart3, PanelLeft, LogOut,
} from "lucide-react";
```

**b) Remove `tenantName` state and `fetchMe` function:**

Change:
```tsx
const [counts, setCounts] = useState<NavCounts>({ hitl: 0, hotlUnread: 0 });
const [tenantName, setTenantName] = useState<string | null>(null);

useEffect(() => {
  async function fetchCounts() {
    try {
      const r = await fetch("/api/nav-counts", { cache: "no-store" });
      if (r.ok) setCounts(await r.json());
    } catch { /* silently ignore */ }
  }
  async function fetchMe() {
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setTenantName(data.tenant_name ?? null);
      }
    } catch { /* silently ignore */ }
  }
  fetchCounts();
  fetchMe();
  const iv = setInterval(fetchCounts, 15000);
  return () => clearInterval(iv);
}, []);
```
To:
```tsx
const [counts, setCounts] = useState<NavCounts>({ hitl: 0, hotlUnread: 0 });

useEffect(() => {
  async function fetchCounts() {
    try {
      const r = await fetch("/api/nav-counts", { cache: "no-store" });
      if (r.ok) setCounts(await r.json());
    } catch { /* silently ignore */ }
  }
  fetchCounts();
  const iv = setInterval(fetchCounts, 15000);
  return () => clearInterval(iv);
}, []);
```

**c) Remove Admin and Profile from systemLinks:**

Change:
```tsx
const systemLinks = [
  { href: "/profile",   label: "Profile",  icon: User },
  { href: "/settings",  label: "Settings", icon: Settings },
  { href: "/admin",     label: "Admin",    icon: Shield },
];
```
To:
```tsx
const systemLinks = [
  { href: "/settings",  label: "Settings", icon: Settings },
];
```

**d) Find where `tenantName` is rendered** (in the sidebar header and footer pill, around lines 112–120 and 184) and replace with a static string. Search the file for `tenantName` and replace each render with `"Jimmy's Agents"` or simply remove it. The exact JSX will depend on reading the rest of the file — find and remove any `{tenantName}`, `{tenantName ?? ...}`, or `<Skeleton>` loading states tied to tenantName.

- [ ] **Step 2: Update frontend/src/app/api/me/route.ts**

Replace with:
```ts
import { NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  try {
    const r = await fetch(`${API_BASE}/me`, {
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json({ user_id: null });
}
```

- [ ] **Step 3: Remove "Cost Today" stat card from page.tsx**

Read `frontend/src/app/page.tsx` to find the costToday stat card (around line 87/92–122 per the exploration). Remove the card that renders `costToday.toFixed(2)` with token count. Keep the other stat cards (total runs, agent status counts, etc.).

Also remove any `costToday` variable declaration derived from `/api/stats` if it's no longer rendered anywhere else on the dashboard.

- [ ] **Step 4: Verify frontend builds**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/layout-shell.tsx \
        frontend/src/app/api/me/route.ts \
        frontend/src/app/page.tsx
git commit -m "frontend: remove tenant UI, admin nav link, profile link, cost today stat"
```

---

## Task 8: Update Docs and CLAUDE.md

**Files:**
- Modify: `docs/dev-notes/auth-flow.md`
- Modify: `docs/dev-notes/active-state.md`
- Modify: `CLAUDE.md` (project root)

- [ ] **Step 1: Update auth-flow.md**

Replace the auth decision tree section. The new flow is:

```
OPTIONS request? → PASS (CORS)
X-Internal-Key header matches INTERNAL_API_KEY? → PASS (request.state.user_id = "internal")
Authorization: Bearer {jwt} valid?
  → Extract sub (Supabase auth UID)
  → Set request.state.user_id = sub → PASS
JWT invalid/expired? → 401
No auth header? → 401
```

Remove all references to `tenant_id`, `user_tenants` table lookup, and the 403 "User has no tenant" error.

Remove the three-role table. There are now two identities: authenticated user (valid JWT) and internal agent (X-Internal-Key).

- [ ] **Step 2: Update active-state.md**

Add a "What Changed" entry:
- Migration 008 applied: removed tenants/user_tenants/tenant_agents tables, dropped tenant_id from all runtime tables
- Auth middleware simplified: no DB lookup on auth path
- All data (HITL/HOTL/runs/schedules) is now global (single-user, no scoping)
- Admin page, admin API routes, and profile page deleted from frontend

Remove any "open issue" entries about RLS (I-04) since they're now moot in a single-user system.

- [ ] **Step 3: Update CLAUDE.md active rules**

Remove or update these rules:
- **"Multi-tenant: all queries scope by tenant_id"** → replace with "Single-user: no tenant scoping. All queries are global."
- **"Thread IDs are namespaced"** → update to: "Thread IDs format: `thread-{agent}-{uuid4}`"
- Remove the rule about `user_tenants` lookup in auth middleware.
- Keep the **HOTL is gateway-owned** and **HITL protocol** rules (still apply).

- [ ] **Step 4: Commit**

```bash
git add docs/dev-notes/auth-flow.md docs/dev-notes/active-state.md CLAUDE.md
git commit -m "docs: update auth flow, active state, and rules for single-user system"
```

---

## Verification

After all tasks are complete:

- [ ] **Backend health**
```bash
make run-api-server
curl http://localhost:8080/ok
# → {"ok":true}
```

- [ ] **Auth still works** — get a valid JWT from Supabase (copy from browser devtools after login) and test:
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:8080/me
# → {"user_id": "<supabase-uid>"}

curl -H "Authorization: Bearer <jwt>" http://localhost:8080/nav-counts
# → {"hitl": 0, "hotlUnread": 0}

curl -H "Authorization: Bearer <jwt>" http://localhost:8080/agents
# → {"gmail-agent": {...}, "calendar-agent": {...}, ...}
```

- [ ] **Schedules, HITL, HOTL**
```bash
curl -H "Authorization: Bearer <jwt>" http://localhost:8080/schedules
# → []  (or existing schedules)

curl -H "Authorization: Bearer <jwt>" http://localhost:8080/hitl
# → []

curl -H "Authorization: Bearer <jwt>" http://localhost:8080/hotl
# → []
```

- [ ] **Internal key bypass still works**
```bash
curl -X POST http://localhost:8080/hitl \
  -H "X-Internal-Key: $INTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agent":"budget-deepagent","item_type":"approval","payload":{"msg":"test"}}'
# → {"id": "<uuid>"}
```

- [ ] **Frontend builds and loads**
```bash
make run-frontend
# Open http://localhost:3000 — sidebar should show no Admin link, no Profile link
# Dashboard loads without errors
# /admin route should 404 (page deleted)
```

- [ ] **Final commit on branch**
```bash
git log --oneline -8
# Should show 8 clean commits from this plan
```
