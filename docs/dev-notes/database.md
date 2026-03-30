# Database

> Read this before touching `backend/db_postgres.py`, any file in `backend/sql/`, or `backend/migrations/`.

---

## Connection

Postgres via **asyncpg** with a module-level connection pool. The pool is created during FastAPI lifespan and stored in `db_postgres._pool`.

```python
# DO NOT create a new pool per request
# DO use the module-level pool everywhere
pool = await db.get_pool()
async with pool.acquire() as conn:
    result = await conn.fetchrow(SQL["query_name"], arg1, arg2)
```

APScheduler jobs **cannot use `request.state`**. They access the pool via `db_postgres._pool` directly. Do not refactor scheduler functions to use request context.

The pool is configured with `max_inactive_connection_lifetime=300` so dropped connections are recycled after 5 minutes. This prevents stale connection errors on long idle periods.

---

## SQL Files

All SQL lives in `backend/sql/`. **No inline SQL in `api_server.py` or `db_postgres.py`.**

```
backend/sql/
  nav.sql        — badge counts (HITL pending, HOTL unread)
  hitl.sql       — HITL inbox CRUD
  hotl.sql       — HOTL log CRUD
  runs.sql       — run_records lifecycle (open, close, list)
  schedules.sql  — schedule CRUD + APScheduler load_all + set_enabled
  agents.sql     — agent status, agents-md search
  admin.sql      — tenant/user/agent admin operations
```

Each SQL file uses `-- name: query_name` markers. `sql_loader.py` parses these at module load and caches them:

```python
from backend.sql_loader import load_sql

_NAV_SQL = load_sql("nav")
result = await conn.fetchrow(_NAV_SQL["get_counts"], tenant_id)
```

**Adding a new query**: add a `-- name: my_query` block to the appropriate domain file, then add a wrapper function in `db_postgres.py`. Never add SQL directly to `api_server.py`.

---

## Schema

All tables are tenant-scoped (every table has a `tenant_id` column). Every DB function in `db_postgres.py` takes `tenant_id` as first arg.

### Core Tables

| Table | Key Columns | Notes |
|---|---|---|
| `tenants` | `id`, `name`, `is_active` | James is `4efdeb00-1b23-4031-bc77-555af005a406` |
| `user_tenants` | `user_id` (Supabase auth UID), `tenant_id` | Auth lookup table |
| `agent_registry` | `name`, `port`, `display_name`, `accent_color` | Populated from `agents.yaml` |
| `tenant_agents` | `tenant_id`, `agent_registry_id` | Which agents each tenant can use |
| `tenant_agent_configs` | `tenant_id`, `agent_name`, `config` (JSONB) | Per-tenant agent overrides |
| `run_records` | `id`, `tenant_id`, `agent`, `run_id`, `status`, `started_at`, `finished_at`, `cost_usd`, `total_tokens` | Every run opened by gateway |
| `hitl_items` | `id`, `tenant_id`, `agent`, `status`, `payload` (JSONB), `decision` | Pending/resolved approvals |
| `hotl_logs` | `id`, `tenant_id`, `agent`, `run_id`, `overview`, `tools` (JSONB), `thoughts`, `cost_usd`, `total_tokens`, `langsmith_run_id`, `read` | Post-run summaries |
| `schedules` | `id`, `tenant_id`, `agent`, `name`, `cron_expr`, `enabled`, `thread_id` | UNIQUE on `(tenant_id, agent, name)` — multiple schedules per agent allowed |

### JSONB Codec

asyncpg doesn't auto-decode JSONB. The pool registers a codec at startup:

```python
await conn.set_type_codec(
    "jsonb",
    encoder=json.dumps,
    decoder=json.loads,
    schema="pg_catalog",
)
```

This is registered in `db_postgres.init_pool()`. If you add a new pool (don't), register the codec there too.

---

## Migrations

Migrations live in `backend/migrations/` and are applied manually via Supabase MCP or SQL editor.

| File | Status | What it does |
|---|---|---|
| `001_schema.sql` | Applied | Core tables: tenants, run_records, hitl_items, hotl_logs, schedules |
| `002_seed.sql` | Applied | Seed data (agent_registry entries from agents.yaml) |
| `003_hotl_cost_fields.sql` | Applied | Adds cost_usd, total_tokens, langsmith_run_id to hotl_logs |
| `004_multiple_schedules.sql` | Applied | Allows multiple schedules per agent via workflow field |
| `005_tenant_agent_configs.sql` | Applied | tenant_agent_configs table for per-tenant agent overrides |
| `006_fix_schedules_unique.sql` | Applied | Adds UNIQUE constraint on (tenant_id, agent, workflow) |
| `007_rename_workflow_to_name.sql` | Applied | Renames `workflow` → `name` in schedules table |

**To apply a new migration**: Use Supabase MCP `apply_migration` tool or paste SQL into the Supabase SQL editor. Always add a new numbered file rather than editing existing ones.

---

## Common Patterns

### Opening and closing a run

```python
run_id = await db.open_run(pool, tenant_id, agent_name, thread_id)
# ... stream happens ...
await db.close_run(pool, run_id, status="done", cost_usd=0.003, total_tokens=1200)
```

### Writing a HOTL entry

```python
await db.create_hotl_log(
    pool, tenant_id, agent_name, run_id,
    overview="...", tools=[...], thoughts="...",
    cost_usd=0.003, total_tokens=1200,
    langsmith_run_id="abc123"
)
```

### Schedule load (APScheduler)

APScheduler loads all schedules at startup via `_reload_schedules()` in `api_server.py`. It uses `_SCHED_SQL["load_all"]` directly with the module-level `_pool`. Job IDs are `"agent_{tenant_id}_{agent}_{name}"`. Toggling a schedule calls `_SCHED_SQL["set_enabled"]` then triggers a reload. Multiple schedules per agent are supported — each has a unique `name` (e.g., `"daily-checkin"`, `"monthly-rollup"`).

---

## Models / LLM Config

Agents should import from `backend/models.py` instead of instantiating LLM clients directly:

```python
# ✅ Good — centralized, easy to swap
from models import gemini_flash_model, free_nvidia_model

# ❌ Avoid — provider-specific, duplicated in every agent
from langchain_google_genai import ChatGoogleGenerativeAI
llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", ...)
```

### Available Models

| Variable | Provider/Model | Cost | Use For |
|---|---|---|---|
| `gemini_flash_model` | `google/gemini-2.5-flash` | Low | Default — general agents |
| `cheap_haiku_three_model` | `anthropic/claude-3-haiku` | Very low | Simple classification, routing |
| `free_nvidia_model` | See note below | Free | Experimentation |

**IMPORTANT**: `nvidia/llama-nemotron-embed-vl-1b-v2:free` in `models.py` is a **vision embedding model**, not a chat LLM. It will not work as an agent backbone. If you want a free NVIDIA chat model, use:
- `nvidia/llama-3.1-nemotron-70b-instruct:free` (available on OpenRouter, rate-limited)

Update `models.py` `free_nvidia_model` to use this model ID before using it in an agent.

All models route through OpenRouter — set `OPENROUTER_API_KEY` in `.env`. This is separate from `GOOGLE_API_KEY`.
