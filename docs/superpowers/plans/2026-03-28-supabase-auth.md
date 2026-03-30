# Supabase Auth + Multi-Tenant Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQLite with Supabase Postgres, add phone OTP auth, and enforce per-tenant data isolation across all FastAPI endpoints and the Next.js dashboard.

**Architecture:** Supabase handles auth (phone OTP → JWT). FastAPI verifies JWTs, extracts `tenant_id` from `user_tenants`, and scopes every DB query to that tenant. Next.js uses `supabase-js` for session management only — all data still flows through FastAPI.

**Tech Stack:** asyncpg, python-jose, FastAPI middleware, @supabase/ssr, Next.js middleware, Supabase Postgres

**Spec:** `docs/superpowers/specs/2026-03-28-supabase-auth-migration-design.md`

---

### Task 1: Create branch + Supabase project

**Files:**
- None (git + Supabase MCP setup)

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/supabase-auth
```

- [ ] **Step 2: Create Supabase project via MCP**

Use the `mcp__claude_ai_Supabase__create_project` tool with:
- name: `jimmys-agents`
- region: closest to your location (e.g. `us-east-1`)

Wait for it to finish initializing (the MCP tool will return the project details).

- [ ] **Step 3: Capture project credentials**

From the MCP response or Supabase dashboard (Settings → API), collect:
- `SUPABASE_URL` — looks like `https://xxxxx.supabase.co`
- `NEXT_PUBLIC_SUPABASE_URL` — same value
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` public key
- `SUPABASE_JWT_SECRET` — Settings → API → JWT Secret
- `DATABASE_URL` — Settings → Database → Connection string (use the "URI" tab, mode: `Session`)

- [ ] **Step 4: Enable Phone Auth in Supabase dashboard**

In the Supabase dashboard: Authentication → Providers → Phone → Enable.
Set up Twilio (or use Supabase's built-in SMS for testing — enable "Enable phone confirmations" with test OTPs).

For local testing without Twilio, Supabase allows test phone numbers. Add `+15555550100` as a test number with code `123456` in Authentication → Phone → Test OTPs.

- [ ] **Step 5: Update .env with new vars**

Add to the root `.env` file (never commit this file):
```
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-from-dashboard
DATABASE_URL=postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 6: Commit the branch**

```bash
git add .env.example
git commit -m "chore: add supabase env var placeholders to .env.example"
```

---

### Task 2: Write and run schema migration

**Files:**
- Create: `backend/migrations/001_schema.sql`
- Create: `backend/migrations/002_seed.sql`

- [ ] **Step 1: Write the schema migration**

Create `backend/migrations/001_schema.sql`:

```sql
-- Tenants
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Maps Supabase auth users to tenants
CREATE TABLE user_tenants (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tenant_id)
);

-- James-maintained master list of agent implementations
CREATE TABLE agent_registry (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT UNIQUE NOT NULL,
  display_name       TEXT NOT NULL,
  port               INTEGER NOT NULL,
  accent_color       TEXT,
  is_globally_active BOOLEAN NOT NULL DEFAULT true
);

-- Per-tenant agent instances
CREATE TABLE tenant_agents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_registry_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'active',
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_registry_id)
);

-- HITL (Human-in-the-loop) approval items
CREATE TABLE hitl_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_hitl_tenant_status ON hitl_items(tenant_id, status);
CREATE INDEX idx_hitl_tenant_agent  ON hitl_items(tenant_id, agent);

-- HOTL (Human-on-the-loop) post-run summaries
CREATE TABLE hotl_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  summary    JSONB NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hotl_tenant_read  ON hotl_logs(tenant_id, is_read);
CREATE INDEX idx_hotl_tenant_agent ON hotl_logs(tenant_id, agent);

-- Run execution records
CREATE TABLE run_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  run_id      TEXT UNIQUE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'running',
  token_count INTEGER DEFAULT 0,
  cost_usd    NUMERIC(10,6) DEFAULT 0,
  error_msg   TEXT
);
CREATE INDEX idx_runs_tenant_agent ON run_records(tenant_id, agent);

-- Agent schedules
CREATE TABLE schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
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
CREATE INDEX idx_schedules_tenant_agent ON schedules(tenant_id, agent);

-- Agent self-written memory (per tenant, replaces MEMORY.md on filesystem)
CREATE TABLE agent_memory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent)
);

-- Agent self-generated rules (per tenant, replaces RULES.md on filesystem)
CREATE TABLE agent_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent)
);
```

- [ ] **Step 2: Write the seed migration**

Create `backend/migrations/002_seed.sql`:

```sql
-- Seed agent_registry from agents.yaml values
INSERT INTO agent_registry (name, display_name, port, accent_color, is_globally_active) VALUES
  ('gmail-agent',    'Gmail Agent',    8001, '#00ff88', true),
  ('calendar-agent', 'Calendar Agent', 8002, '#00d4ff', true),
  ('budget-agent',   'Budget Agent',   8003, '#a855f7', true),
  ('job-app-chain',  'Job App Chain',  8004, '#f59e0b', true)
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 3: Apply migrations via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: from Task 1 Step 2
- `name`: `initial_schema`
- `query`: contents of `001_schema.sql`

Then apply the second migration:
- `name`: `seed_agent_registry`
- `query`: contents of `002_seed.sql`

- [ ] **Step 4: Verify via Supabase MCP**

Use `mcp__claude_ai_Supabase__execute_sql` to verify:
```sql
SELECT name, display_name, port FROM agent_registry ORDER BY port;
```

Expected: 4 rows for gmail, calendar, budget, job-app-chain agents.

- [ ] **Step 5: Create James's tenant + user manually**

In Supabase dashboard → Authentication → Users → "Add user" → enter your phone number.

Then in SQL editor (or via MCP `execute_sql`):
```sql
-- Create James's tenant
INSERT INTO tenants (name) VALUES ('James') RETURNING id;
-- Copy the returned id, then:
INSERT INTO user_tenants (user_id, tenant_id)
VALUES (
  (SELECT id FROM auth.users WHERE phone = '+1YOURNUMBER'),
  (SELECT id FROM tenants WHERE name = 'James')
);
-- Give James all agents
INSERT INTO tenant_agents (tenant_id, agent_registry_id)
SELECT t.id, ar.id
FROM tenants t, agent_registry ar
WHERE t.name = 'James';
```

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/
git commit -m "feat: add postgres schema migrations + agent_registry seed"
```

---

### Task 3: Install Python dependencies

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Add new dependencies**

Add to `requirements.txt`:
```
asyncpg==0.29.0
python-jose[cryptography]==3.3.0
```

- [ ] **Step 2: Install**

```bash
make install
```

Or directly:
```bash
python3.13 -m pip install asyncpg==0.29.0 "python-jose[cryptography]==3.3.0"
```

- [ ] **Step 3: Verify import**

```bash
python3.13 -c "import asyncpg; import jose; print('ok')"
```

Expected: `ok`

---

### Task 4: Write FastAPI JWT auth middleware

**Files:**
- Create: `backend/auth_middleware.py`
- Create: `tests/test_auth_middleware.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_auth_middleware.py`:

```python
import pytest
import time
from jose import jwt
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

TEST_JWT_SECRET = "test-secret-32-chars-exactly-ok!"
TEST_TENANT_ID = "11111111-1111-1111-1111-111111111111"
TEST_USER_ID   = "22222222-2222-2222-2222-222222222222"

def make_token(user_id=TEST_USER_ID, secret=TEST_JWT_SECRET, expired=False):
    exp = time.time() + (-10 if expired else 3600)
    return jwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": exp},
        secret,
        algorithm="HS256",
    )

@pytest.fixture
def app_with_middleware():
    from backend.auth_middleware import auth_middleware
    app = FastAPI()
    app.middleware("http")(auth_middleware)

    @app.get("/ok")
    async def health():
        return {"ok": True}

    @app.get("/protected")
    async def protected(request: Request):
        return {"tenant_id": request.state.tenant_id}

    return app

def test_health_skips_auth(app_with_middleware):
    client = TestClient(app_with_middleware, raise_server_exceptions=False)
    resp = client.get("/ok")
    assert resp.status_code == 200

def test_missing_token_returns_401(app_with_middleware):
    client = TestClient(app_with_middleware, raise_server_exceptions=False)
    resp = client.get("/protected")
    assert resp.status_code == 401

def test_invalid_token_returns_401(app_with_middleware):
    client = TestClient(app_with_middleware, raise_server_exceptions=False)
    resp = client.get("/protected", headers={"Authorization": "Bearer badtoken"})
    assert resp.status_code == 401

def test_expired_token_returns_401(app_with_middleware):
    client = TestClient(app_with_middleware, raise_server_exceptions=False)
    token = make_token(expired=True)
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
python3.13 -m pytest tests/test_auth_middleware.py -v
```

Expected: `ImportError` or `ModuleNotFoundError` — `auth_middleware` does not exist yet.

- [ ] **Step 3: Write the middleware**

Create `backend/auth_middleware.py`:

```python
import os
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from jose import jwt, JWTError

SKIP_PATHS = {"/ok", "/docs", "/openapi.json", "/redoc"}

def _get_jwt_secret() -> str:
    secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    if not secret:
        raise RuntimeError("SUPABASE_JWT_SECRET env var not set")
    return secret

async def auth_middleware(request: Request, call_next):
    if request.url.path in SKIP_PATHS:
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Missing auth token"})

    token = auth_header.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(
            token,
            _get_jwt_secret(),
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})

    user_id = payload.get("sub")
    if not user_id:
        return JSONResponse(status_code=401, content={"detail": "Token missing sub"})

    # Resolve tenant_id from DB (pool attached to app.state in api_server.py)
    pool = request.app.state.pool
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT tenant_id FROM user_tenants WHERE user_id = $1", user_id
        )
    if not row:
        return JSONResponse(status_code=403, content={"detail": "User has no tenant"})

    request.state.tenant_id = str(row["tenant_id"])
    request.state.user_id = user_id
    return await call_next(request)
```

- [ ] **Step 4: Add pool mock to tests and re-run**

Update `tests/test_auth_middleware.py` — add pool mock to the fixture:

```python
@pytest.fixture
def app_with_middleware(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)

    # Mock asyncpg pool
    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value={"tenant_id": TEST_TENANT_ID})
    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=mock_conn),
        __aexit__=AsyncMock(return_value=None),
    ))

    from backend.auth_middleware import auth_middleware
    app = FastAPI()
    app.state.pool = mock_pool
    app.middleware("http")(auth_middleware)

    @app.get("/ok")
    async def health():
        return {"ok": True}

    @app.get("/protected")
    async def protected(request: Request):
        return {"tenant_id": request.state.tenant_id}

    return app

def test_valid_token_attaches_tenant(app_with_middleware):
    client = TestClient(app_with_middleware, raise_server_exceptions=False)
    token = make_token()
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] == TEST_TENANT_ID
```

Run:
```bash
python3.13 -m pytest tests/test_auth_middleware.py -v
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/auth_middleware.py tests/test_auth_middleware.py
git commit -m "feat: add JWT auth middleware with tenant_id extraction"
```

---

### Task 5: Write Postgres DB layer

**Files:**
- Create: `backend/db_postgres.py`
- Create: `tests/test_db_postgres.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_db_postgres.py`:

```python
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

TENANT_ID = "11111111-1111-1111-1111-111111111111"

@pytest.fixture
def mock_conn():
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=[])
    conn.fetchrow = AsyncMock(return_value=None)
    conn.execute = AsyncMock(return_value="INSERT 1")
    return conn

@pytest.mark.asyncio
async def test_get_nav_counts_returns_zeros(mock_conn):
    from backend.db_postgres import get_nav_counts
    mock_conn.fetchrow = AsyncMock(return_value={"hitl": 0, "hotl_unread": 0})
    result = await get_nav_counts(mock_conn, TENANT_ID)
    assert result == {"hitl": 0, "hotlUnread": 0}

@pytest.mark.asyncio
async def test_create_hitl_item(mock_conn):
    from backend.db_postgres import create_hitl_item
    mock_conn.fetchrow = AsyncMock(return_value={
        "id": "abc", "tenant_id": TENANT_ID, "agent": "budget-agent",
        "item_type": "approval", "payload": "{}", "status": "pending",
        "comment": None, "created_at": "2026-01-01", "resolved_at": None
    })
    result = await create_hitl_item(mock_conn, TENANT_ID, "budget-agent", "approval", {})
    assert result["status"] == "pending"
    assert result["agent"] == "budget-agent"

@pytest.mark.asyncio
async def test_list_hotl_logs_filters_by_tenant(mock_conn):
    from backend.db_postgres import list_hotl_logs
    await list_hotl_logs(mock_conn, TENANT_ID)
    call_args = mock_conn.fetch.call_args
    assert TENANT_ID in str(call_args)
```

- [ ] **Step 2: Run to confirm failure**

```bash
python3.13 -m pytest tests/test_db_postgres.py -v
```

Expected: `ImportError` — `db_postgres` not defined yet.

- [ ] **Step 3: Write the DB layer**

Create `backend/db_postgres.py`:

```python
"""
Postgres DB layer — replaces backend/db.py (SQLite).
All functions take a conn (asyncpg connection) and tenant_id.
The pool is created in api_server.py lifespan and passed via request.app.state.pool.
"""
import json
from datetime import datetime, timezone
from typing import Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Nav counts ────────────────────────────────────────────────────────────────

async def get_nav_counts(conn, tenant_id: str) -> dict:
    row = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*) FROM hitl_items  WHERE tenant_id=$1 AND status='pending') AS hitl,
          (SELECT COUNT(*) FROM hotl_logs   WHERE tenant_id=$1 AND is_read=false)    AS hotl_unread
        """,
        tenant_id,
    )
    return {"hitl": row["hitl"], "hotlUnread": row["hotl_unread"]}


# ── HITL ──────────────────────────────────────────────────────────────────────

async def list_hitl_items(conn, tenant_id: str, status: Optional[str] = None, agent: Optional[str] = None) -> list:
    query = "SELECT * FROM hitl_items WHERE tenant_id=$1"
    params = [tenant_id]
    if status:
        params.append(status)
        query += f" AND status=${len(params)}"
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    query += " ORDER BY created_at DESC LIMIT 200"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def get_hitl_item(conn, tenant_id: str, item_id: str) -> Optional[dict]:
    row = await conn.fetchrow(
        "SELECT * FROM hitl_items WHERE id=$1 AND tenant_id=$2", item_id, tenant_id
    )
    return dict(row) if row else None


async def create_hitl_item(conn, tenant_id: str, agent: str, item_type: str, payload: dict) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO hitl_items (tenant_id, agent, item_type, payload, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        tenant_id, agent, item_type, json.dumps(payload), _now(),
    )
    return dict(row)


async def resolve_hitl_item(conn, tenant_id: str, item_id: str, status: str, comment: Optional[str] = None) -> Optional[dict]:
    row = await conn.fetchrow(
        """
        UPDATE hitl_items SET status=$1, comment=$2, resolved_at=$3
        WHERE id=$4 AND tenant_id=$5
        RETURNING *
        """,
        status, comment, _now(), item_id, tenant_id,
    )
    return dict(row) if row else None


# ── HOTL ──────────────────────────────────────────────────────────────────────

async def list_hotl_logs(conn, tenant_id: str, agent: Optional[str] = None, unread_only: bool = False, limit: int = 50) -> list:
    query = "SELECT * FROM hotl_logs WHERE tenant_id=$1"
    params = [tenant_id]
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    if unread_only:
        query += " AND is_read=false"
    query += f" ORDER BY created_at DESC LIMIT {min(limit, 200)}"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def create_hotl_log(conn, tenant_id: str, agent: str, run_id: str, summary: dict) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO hotl_logs (tenant_id, agent, run_id, summary, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
        """,
        tenant_id, agent, run_id, json.dumps(summary), _now(),
    )
    return dict(row)


async def mark_hotl_read(conn, tenant_id: str, log_id: str) -> None:
    await conn.execute(
        "UPDATE hotl_logs SET is_read=true WHERE id=$1 AND tenant_id=$2", log_id, tenant_id
    )


async def mark_all_hotl_read(conn, tenant_id: str, agent: Optional[str] = None) -> None:
    if agent:
        await conn.execute(
            "UPDATE hotl_logs SET is_read=true WHERE tenant_id=$1 AND agent=$2", tenant_id, agent
        )
    else:
        await conn.execute("UPDATE hotl_logs SET is_read=true WHERE tenant_id=$1", tenant_id)


async def clear_hotl_logs(conn, tenant_id: str) -> None:
    await conn.execute("DELETE FROM hotl_logs WHERE tenant_id=$1", tenant_id)


# ── Run records ───────────────────────────────────────────────────────────────

async def list_runs(conn, tenant_id: str, agent: Optional[str] = None, limit: int = 50) -> list:
    query = "SELECT * FROM run_records WHERE tenant_id=$1"
    params = [tenant_id]
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    query += f" ORDER BY started_at DESC LIMIT {min(limit, 200)}"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def start_run(conn, tenant_id: str, agent: str, run_id: str) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO run_records (tenant_id, agent, run_id, started_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        tenant_id, agent, run_id, _now(),
    )
    return dict(row)


async def finish_run(conn, tenant_id: str, run_id: str, status: str, token_count: int = 0, cost_usd: float = 0.0, error_msg: Optional[str] = None) -> Optional[dict]:
    row = await conn.fetchrow(
        """
        UPDATE run_records
        SET finished_at=$1, status=$2, token_count=$3, cost_usd=$4, error_msg=$5
        WHERE run_id=$6 AND tenant_id=$7
        RETURNING *
        """,
        _now(), status, token_count, cost_usd, error_msg, run_id, tenant_id,
    )
    return dict(row) if row else None


# ── Schedules ─────────────────────────────────────────────────────────────────

async def list_schedules(conn, tenant_id: str, agent: Optional[str] = None) -> list:
    query = "SELECT * FROM schedules WHERE tenant_id=$1"
    params = [tenant_id]
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def upsert_schedule(conn, tenant_id: str, agent: str, workflow: str, cron_expr: str, enabled: bool, task_prompt: Optional[str], thread_id: Optional[str] = None) -> dict:
    row = await conn.fetchrow(
        """
        INSERT INTO schedules (tenant_id, agent, workflow, cron_expr, enabled, task_prompt, thread_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, agent, workflow)
        DO UPDATE SET cron_expr=$4, enabled=$5, task_prompt=$6, thread_id=COALESCE($7, schedules.thread_id)
        RETURNING *
        """,
        tenant_id, agent, workflow, cron_expr, enabled, task_prompt, thread_id,
    )
    return dict(row)


# ── Stats ─────────────────────────────────────────────────────────────────────

async def get_stats(conn, tenant_id: str) -> dict:
    rows = await conn.fetch(
        """
        SELECT agent,
               COUNT(*)                       AS runs,
               COALESCE(SUM(token_count), 0)  AS tokens,
               COALESCE(SUM(cost_usd), 0)     AS cost
        FROM run_records
        WHERE tenant_id=$1
        GROUP BY agent
        """,
        tenant_id,
    )
    by_agent = {r["agent"]: {"runs": r["runs"], "tokens": r["tokens"], "cost": float(r["cost"])} for r in rows}
    return {
        "total_runs":   sum(v["runs"]   for v in by_agent.values()),
        "total_tokens": sum(v["tokens"] for v in by_agent.values()),
        "total_cost":   sum(v["cost"]   for v in by_agent.values()),
        "by_agent": by_agent,
    }


# ── Agent memory ──────────────────────────────────────────────────────────────

async def get_agent_memory(conn, tenant_id: str, agent: str) -> str:
    row = await conn.fetchrow(
        "SELECT content FROM agent_memory WHERE tenant_id=$1 AND agent=$2", tenant_id, agent
    )
    return row["content"] if row else ""


async def upsert_agent_memory(conn, tenant_id: str, agent: str, content: str) -> None:
    await conn.execute(
        """
        INSERT INTO agent_memory (tenant_id, agent, content, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (tenant_id, agent)
        DO UPDATE SET content=$3, updated_at=now()
        """,
        tenant_id, agent, content,
    )


async def get_agent_rules(conn, tenant_id: str, agent: str) -> str:
    row = await conn.fetchrow(
        "SELECT content FROM agent_rules WHERE tenant_id=$1 AND agent=$2", tenant_id, agent
    )
    return row["content"] if row else ""


async def upsert_agent_rules(conn, tenant_id: str, agent: str, content: str) -> None:
    await conn.execute(
        """
        INSERT INTO agent_rules (tenant_id, agent, content, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (tenant_id, agent)
        DO UPDATE SET content=$3, updated_at=now()
        """,
        tenant_id, agent, content,
    )


# ── Tenant agents ─────────────────────────────────────────────────────────────

async def list_tenant_agents(conn, tenant_id: str, include_archived: bool = False) -> list:
    status_filter = "" if include_archived else "AND ta.status='active'"
    rows = await conn.fetch(
        f"""
        SELECT ar.name, ar.display_name, ar.port, ar.accent_color, ta.status, ta.archived_at
        FROM tenant_agents ta
        JOIN agent_registry ar ON ta.agent_registry_id = ar.id
        WHERE ta.tenant_id=$1 AND ar.is_globally_active=true {status_filter}
        ORDER BY ar.port
        """,
        tenant_id,
    )
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Run tests**

```bash
python3.13 -m pytest tests/test_db_postgres.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/db_postgres.py tests/test_db_postgres.py
git commit -m "feat: add asyncpg postgres DB layer replacing sqlite"
```

---

### Task 6: Wire pool + middleware into api_server.py

**Files:**
- Modify: `backend/api_server.py`

- [ ] **Step 1: Add lifespan + pool to api_server.py**

At the top of `backend/api_server.py`, replace the existing startup code with:

```python
import os
import asyncpg
from contextlib import asynccontextmanager
from backend.auth_middleware import auth_middleware

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await asyncpg.create_pool(os.environ["DATABASE_URL"], min_size=2, max_size=10)
    # existing scheduler startup code goes here (if any)
    yield
    await app.state.pool.close()

app = FastAPI(lifespan=lifespan)
app.middleware("http")(auth_middleware)
```

- [ ] **Step 2: Add a helper to get a connection from pool**

Add to `api_server.py` (near top, after app definition):

```python
from fastapi import Request

def get_conn(request: Request):
    """Returns the asyncpg pool — use as: async with get_conn(request).acquire() as conn:"""
    return request.app.state.pool
```

- [ ] **Step 3: Update GET /agents to read from tenant_agents + agent_registry**

Replace the current `GET /agents` endpoint (which reads from `agents.yaml` via `agent_registry.py`) with a DB query:

```python
@app.get("/agents")
async def get_agents(request: Request):
    async with get_conn(request).acquire() as conn:
        agents = await db_postgres.list_tenant_agents(conn, request.state.tenant_id)
    return agents
```

This returns only the agents provisioned for this tenant (active by default). The `agents.yaml` file and `agent_registry.py` remain as the operational source of truth for running agents — the DB `agent_registry` table is the authorization layer for what a tenant can see.

- [ ] **Step 4: Enforce thread ID namespacing in upsert_schedule**

Thread IDs must be namespaced to prevent cross-tenant LangGraph state mixing. When creating a new schedule (no existing `thread_id`), generate one with the format `thread-{tenant_id}-{agent}-{uuid}`:

Add to `backend/db_postgres.py`:

```python
import uuid as _uuid

def make_thread_id(tenant_id: str, agent: str) -> str:
    return f"thread-{tenant_id}-{agent}-{_uuid.uuid4().hex}"
```

Update `upsert_schedule` to auto-generate thread_id if not provided:

```python
async def upsert_schedule(conn, tenant_id: str, agent: str, workflow: str, cron_expr: str, enabled: bool, task_prompt: Optional[str], thread_id: Optional[str] = None) -> dict:
    if thread_id is None:
        thread_id = make_thread_id(tenant_id, agent)
    row = await conn.fetchrow(
        """
        INSERT INTO schedules (tenant_id, agent, workflow, cron_expr, enabled, task_prompt, thread_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (tenant_id, agent, workflow)
        DO UPDATE SET cron_expr=$4, enabled=$5, task_prompt=$6,
                      thread_id=COALESCE(schedules.thread_id, $7)
        RETURNING *
        """,
        tenant_id, agent, workflow, cron_expr, enabled, task_prompt, thread_id,
    )
    return dict(row)
```

The `COALESCE(schedules.thread_id, $7)` keeps the existing thread_id on updates — only sets it on first insert, preserving conversation continuity.

- [ ] **Step 5: Update every remaining endpoint to use tenant_id + new DB functions**

Replace all sqlite DB calls with the new `db_postgres` functions. Pattern for every endpoint:

```python
# OLD (sqlite pattern):
async def get_nav_counts_endpoint():
    counts = db.get_nav_counts()
    return counts

# NEW (asyncpg + tenant pattern):
async def get_nav_counts_endpoint(request: Request):
    async with get_conn(request).acquire() as conn:
        counts = await db_postgres.get_nav_counts(conn, request.state.tenant_id)
    return counts
```

Apply this pattern to every endpoint:
- `GET /nav-counts` → `get_nav_counts(conn, tenant_id)`
- `GET /hitl` → `list_hitl_items(conn, tenant_id, status, agent)`
- `POST /hitl` → `create_hitl_item(conn, tenant_id, ...)`
- `GET /hitl/{id}` → `get_hitl_item(conn, tenant_id, id)`
- `POST /hitl/{id}/resolve` → `resolve_hitl_item(conn, tenant_id, id, ...)`
- `GET /hotl` → `list_hotl_logs(conn, tenant_id, ...)`
- `POST /hotl` → `create_hotl_log(conn, tenant_id, ...)`
- `POST /hotl/{id}/read` → `mark_hotl_read(conn, tenant_id, id)`
- `POST /hotl/read-all` → `mark_all_hotl_read(conn, tenant_id, agent)`
- `POST /hotl/clear` → `clear_hotl_logs(conn, tenant_id)`
- `GET /runs` → `list_runs(conn, tenant_id, agent, limit)`
- `POST /runs/start` → `start_run(conn, tenant_id, agent, run_id)`
- `POST /runs/{id}/finish` → `finish_run(conn, tenant_id, run_id, ...)`
- `GET /schedules` → `list_schedules(conn, tenant_id, agent)`
- `POST /schedules` → `upsert_schedule(conn, tenant_id, ...)`
- `GET /stats` → `get_stats(conn, tenant_id)`
- `GET /agents/{name}/memory` → `get_agent_memory(conn, tenant_id, name)`
- `GET /agents/{name}/rules` → `get_agent_rules(conn, tenant_id, name)`

- [ ] **Step 6: Remove the old SQLite import**

Delete or comment out:
```python
# from backend import db  ← remove this line
```

Add at top:
```python
from backend import db_postgres
```

- [ ] **Step 7: Start the server and hit /ok**

```bash
make run-api-server
```

In another terminal:
```bash
curl http://localhost:8080/ok
```

Expected: `{"ok": true}` with no errors in the server log.

- [ ] **Step 8: Confirm auth is enforced**

```bash
curl http://localhost:8080/nav-counts
```

Expected: `{"detail": "Missing auth token"}` with status 401.

- [ ] **Step 9: Commit**

```bash
git add backend/api_server.py backend/db_postgres.py
git commit -m "feat: wire asyncpg pool + JWT middleware into api_server, enforce thread ID namespacing"
```

---

### Task 7: Install Supabase frontend dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install packages**

```bash
cd frontend && npm install @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Verify install**

```bash
node -e "require('@supabase/supabase-js'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @supabase/supabase-js and @supabase/ssr"
```

---

### Task 8: Create Supabase client utility

**Files:**
- Create: `frontend/src/lib/supabase.ts`

- [ ] **Step 1: Write the client module**

Create `frontend/src/lib/supabase.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Browser-side Supabase client.
 * Used in Client Components for auth operations (signIn, signOut, getSession).
 * Do NOT use for data queries — all data goes through FastAPI.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl, supabaseAnon)
}
```

- [ ] **Step 2: Add env vars to frontend**

Create `frontend/.env.local` (not committed):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors on the new file.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/supabase.ts
git commit -m "feat: add supabase browser client utility"
```

---

### Task 9: Add Next.js route protection middleware

**Files:**
- Create: `frontend/src/middleware.ts`

- [ ] **Step 1: Write the middleware**

Create `frontend/src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session if expired — required for Server Components
  const { data: { session } } = await supabase.auth.getSession()

  const isLoginPath = request.nextUrl.pathname.startsWith('/login')

  if (!session && !isLoginPath) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isLoginPath) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    // Run on all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start the frontend and confirm redirect**

```bash
make run-frontend
```

Open `http://localhost:3000` in the browser.

Expected: redirect to `http://localhost:3000/login` (which will 404 — that's fine, the middleware works).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/middleware.ts
git commit -m "feat: add Next.js auth middleware — redirect unauthenticated users to /login"
```

---

### Task 10: Build /login and /login/verify pages

**Files:**
- Create: `frontend/src/app/login/page.tsx`
- Create: `frontend/src/app/login/verify/page.tsx`

- [ ] **Step 1: Write the phone entry page**

Create `frontend/src/app/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { channel: 'sms' },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Store phone in sessionStorage so verify page can use it
    sessionStorage.setItem('login_phone', phone)
    router.push('/login/verify')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Enter your phone number to receive a code
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            autoFocus
            className="font-mono"
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading || !phone}>
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the OTP verify page**

Create `frontend/src/app/login/verify/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default function VerifyPage() {
  const [token, setToken] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const stored = sessionStorage.getItem('login_phone')
    if (!stored) {
      router.push('/login')
      return
    }
    setPhone(stored)
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    sessionStorage.removeItem('login_phone')
    router.push('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 px-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Enter code</h1>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to {phone || 'your phone'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            value={token}
            onChange={e => setToken(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
            className="font-mono text-center text-2xl tracking-[0.5em]"
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading || token.length < 6}>
            {loading ? 'Verifying…' : 'Verify'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => router.push('/login')}
          >
            Use a different number
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify the login pages render**

With the frontend running (`make run-frontend`), visit:
- `http://localhost:3000/login` — phone input should render
- `http://localhost:3000/login/verify` — should redirect to `/login` (no phone in session)

- [ ] **Step 4: Test the full OTP flow**

Use the Supabase test phone number configured in Task 1 Step 4:
- Phone: `+15555550100`
- Code: `123456`

Enter the phone → click Send code → enter `123456` → should redirect to `/`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/login/
git commit -m "feat: add /login and /login/verify pages with phone OTP"
```

---

### Task 11: Update LayoutShell with user context

**Files:**
- Modify: `frontend/src/components/layout-shell.tsx`

- [ ] **Step 1: Read the current layout-shell**

Read `frontend/src/components/layout-shell.tsx` to understand current structure before editing.

- [ ] **Step 2: Add user pill + sign out to LayoutShell**

At the bottom of the sidebar (before the closing sidebar tag), add:

```tsx
// Add to imports:
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'

// Add inside the component:
const supabase = createClient()
const router = useRouter()
const [tenantName, setTenantName] = useState<string>('')

useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    // Fetch tenant name from FastAPI
    fetch('/api/me', {
      headers: { Authorization: `Bearer ${session.access_token}` }
    })
      .then(r => r.json())
      .then(d => setTenantName(d.tenant_name ?? ''))
      .catch(() => {})
  })
}, [])

async function handleSignOut() {
  await supabase.auth.signOut()
  router.push('/login')
}

// Add at the bottom of the sidebar JSX:
// <div className="mt-auto border-t border-border pt-3 pb-2 px-3 flex items-center justify-between">
//   <span className="text-xs text-muted-foreground font-mono truncate">{tenantName}</span>
//   <button onClick={handleSignOut} className="text-muted-foreground hover:text-foreground transition-colors">
//     <LogOut className="h-4 w-4" />
//   </button>
// </div>
```

- [ ] **Step 3: Add GET /me endpoint to FastAPI**

In `backend/api_server.py`, add:

```python
@app.get("/me")
async def get_me(request: Request):
    async with get_conn(request).acquire() as conn:
        row = await conn.fetchrow(
            "SELECT name FROM tenants WHERE id=$1", request.state.tenant_id
        )
    return {"tenant_name": row["name"] if row else ""}
```

- [ ] **Step 4: Add /api/me proxy route in Next.js**

Create `frontend/src/app/api/me/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resp = await fetch(`${process.env.AGENT_API_URL ?? 'http://localhost:8080'}/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  return NextResponse.json(await resp.json(), { status: resp.status })
}
```

- [ ] **Step 5: Verify user pill renders**

Log in via the OTP flow. Confirm the sidebar shows your tenant name ("James") and a sign-out icon at the bottom.

Click sign out — confirm redirect to `/login`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout-shell.tsx frontend/src/app/api/me/
git commit -m "feat: add user pill + sign out to LayoutShell"
```

---

### Task 12: Update Bearer token in all frontend API calls

**Files:**
- Modify: `frontend/src/hooks/use-agent-chat.ts`
- Modify: `frontend/src/hooks/use-ag-ui-stream.ts`
- Modify: All `frontend/src/app/api/` proxy routes

- [ ] **Step 1: Add auth header helper**

Add to `frontend/src/lib/supabase.ts`:

```typescript
/**
 * Gets the current session access token for use in API calls.
 * Returns null if not logged in.
 */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}
```

- [ ] **Step 2: Update all Next.js API proxy routes**

Every file in `frontend/src/app/api/` that calls `http://localhost:8080` must forward the auth token.

Pattern to apply to each proxy route:

```typescript
// At top of every proxy route handler:
import { createClient } from '@/lib/supabase'

// Inside the handler:
const supabase = createClient()
const { data: { session } } = await supabase.auth.getSession()
if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

// Add to every fetch() to FastAPI:
headers: {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${session.access_token}`,
}
```

Apply this to every file in `frontend/src/app/api/`.

- [ ] **Step 3: Update useAgentChat hook**

In `frontend/src/hooks/use-agent-chat.ts`, the fetch to `/api/chat/{agent}` is internal (Next.js proxy route) so it doesn't need a token directly — the proxy route adds the token. Verify the proxy route for chat already passes the token to FastAPI. If not, update it now using the pattern from Step 2.

- [ ] **Step 4: Verify all pages load with real data**

With both `make run-api-server` and `make run-frontend` running, log in and visit:
- `/` — dashboard stats load
- `/logs` — HOTL logs page loads (empty is fine)
- `/inbox` — HITL inbox loads (empty is fine)
- `/schedules` — schedules page loads

All pages should load without 401 errors in the browser console.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/supabase.ts frontend/src/app/api/ frontend/src/hooks/
git commit -m "feat: forward supabase JWT to all FastAPI proxy routes"
```

---

### Task 13: Update docs

**Files:**
- Modify: `docs/deepagents.md`
- Modify: `.env.example`
- Modify: `CLAUDE.md` (project root)

- [ ] **Step 1: Update docs/deepagents.md**

Add a "Three-Layer Ownership Model" section at the top of `docs/deepagents.md`:

```markdown
## Three-Layer Ownership Model

Every agent's content is divided into three ownership layers:

**Layer 1 — James owns (filesystem, git-controlled, invisible to clients)**
- `agent.py` — implementation, tools, how the agent reasons
- `skills/SKILL.md` — guardrails, core instructions, base prompts
- `skills/AGENTS.md` — starting memory seed

**Layer 2 — Agent self-writes (Postgres, per-tenant, agent-authored)**
- `agent_memory` table — what the agent has learned about this client's context
- `agent_rules` table — rules generated from working with this client

Clients can READ their Layer 2 (visible in the Memory tab). Only the agent writes to it.

**Layer 3 — Client configures (Postgres, per-tenant, UI-editable)**
- `schedules.task_prompt` — what to do on each scheduled run
- `schedules.cron_expr` — when to run
- HITL approve/reject decisions

When you update Layer 1 code, all clients get the improvement on their next run.
Clients never see or modify Layer 1.
```

- [ ] **Step 2: Update .env.example**

Add to `.env.example`:
```bash
# Supabase (required)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_JWT_SECRET=your-jwt-secret-from-supabase-dashboard
DATABASE_URL=postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres

# Supabase (frontend)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

- [ ] **Step 3: Update CLAUDE.md active rules**

Add to the Active Rules section of `CLAUDE.md`:

```
- **Multi-tenant Postgres via Supabase**: All DB queries must include `tenant_id` from `request.state.tenant_id`. Never query without tenant scoping. Auth is JWT verified in `backend/auth_middleware.py`. DB functions are in `backend/db_postgres.py`.
- **backend/db.py is deleted**: The old SQLite layer is gone. Use `db_postgres` functions only.
- **Three-layer agent ownership**: Layer 1 = James (filesystem), Layer 2 = agent self-writes (Postgres per-tenant), Layer 3 = client config (Postgres per-tenant). See docs/deepagents.md.
```

- [ ] **Step 4: Commit**

```bash
git add docs/deepagents.md .env.example CLAUDE.md
git commit -m "docs: three-layer ownership model, supabase env vars, updated rules"
```

---

### Task 14: End-to-end verification + cleanup

**Files:**
- Delete: `backend/db.py` (replaced by db_postgres.py)

- [ ] **Step 1: Run all tests**

```bash
python3.13 -m pytest tests/ -v
```

Expected: all tests pass with no import errors.

- [ ] **Step 2: Full flow smoke test**

Start all services:
```bash
make run-api-server &
make run-frontend &
```

Run through this checklist:
1. Visit `http://localhost:3000` → redirects to `/login` ✓
2. Enter test phone `+15555550100` → click Send code ✓
3. Enter code `123456` → redirects to `/` ✓
4. Dashboard loads — no 401 errors in browser console ✓
5. Visit `/logs` — loads (empty) ✓
6. Visit `/inbox` — loads (empty) ✓
7. Visit `/schedules` — loads (empty) ✓
8. Sign out → redirects to `/login` ✓
9. Visit `http://localhost:3000/` without session → redirects to `/login` ✓

- [ ] **Step 3: Verify tenant isolation in DB**

Via Supabase MCP `execute_sql`:
```sql
-- Confirm James tenant exists
SELECT t.name, ut.user_id, ta.status, ar.name as agent
FROM tenants t
JOIN user_tenants ut ON ut.tenant_id = t.id
JOIN tenant_agents ta ON ta.tenant_id = t.id
JOIN agent_registry ar ON ta.agent_registry_id = ar.id
WHERE t.name = 'James';
```

Expected: 4 rows (one per agent), all status='active'.

- [ ] **Step 4: Delete the old SQLite DB layer**

```bash
rm backend/db.py
git rm backend/db.py
```

Confirm nothing imports `from backend import db` or `from backend.db import`:
```bash
grep -r "from backend import db\b\|from backend.db import" --include="*.py" .
```

Expected: no results.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: remove legacy sqlite db.py, all data now in supabase postgres"
```

- [ ] **Step 6: Open PR to main**

```bash
git push -u origin feat/supabase-auth
```

Then open a PR via GitHub. Title: `feat: supabase auth + multi-tenant postgres migration`

---

## Deferred (not in this plan)

- Roles (admin / client / member) — separate PR when first real client is onboarded
- Client provisioning UI (`/admin/clients`) — James adds tenants via Supabase dashboard for now
- Agent `FilesystemBackend` → `PostgresBackend` full replacement — agents still write MEMORY.md to disk; the API layer reads from `agent_memory` table (synced manually for now)
- Realtime subscriptions — SSE polling is sufficient for now
