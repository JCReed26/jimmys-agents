"""
Postgres DB layer replacing backend/db.py (SQLite).
ALL functions require conn (asyncpg connection) + tenant_id.
Never query without tenant_id scoping.

SQL strings are loaded from backend/sql/*.sql via sql_loader.
"""
import json
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

from backend.sql_loader import load_sql


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_thread_id(tenant_id: str, agent: str) -> str:
    """Generate a tenant-namespaced thread ID to prevent cross-tenant LangGraph mixing."""
    return f"thread-{tenant_id}-{agent}-{_uuid.uuid4().hex}"


# ── Nav counts ────────────────────────────────────────────────────────────────

async def get_nav_counts(conn, tenant_id: str) -> dict:
    Q = load_sql("nav")
    row = await conn.fetchrow(Q["nav_counts"], tenant_id)
    return {"hitl": row["hitl"], "hotlUnread": row["hotl_unread"]}


# ── HITL ──────────────────────────────────────────────────────────────────────

async def list_hitl_items(conn, tenant_id: str, status: Optional[str] = None, agent: Optional[str] = None) -> list:
    Q = load_sql("hitl")
    query = Q["list_base"]
    params: list = [tenant_id]
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
    Q = load_sql("hitl")
    row = await conn.fetchrow(Q["get_item"], item_id, tenant_id)
    return dict(row) if row else None


async def create_hitl_item(conn, tenant_id: str, agent: str, item_type: str, payload: dict) -> dict:
    Q = load_sql("hitl")
    row = await conn.fetchrow(Q["create_item"], tenant_id, agent, item_type, json.dumps(payload), _now())
    return dict(row)


async def resolve_hitl_item(conn, tenant_id: str, item_id: str, status: str, comment: Optional[str] = None) -> Optional[dict]:
    Q = load_sql("hitl")
    row = await conn.fetchrow(Q["resolve_item"], status, comment, _now(), item_id, tenant_id)
    return dict(row) if row else None


# ── HOTL ──────────────────────────────────────────────────────────────────────

async def list_hotl_logs(conn, tenant_id: str, agent: Optional[str] = None, unread_only: bool = False, limit: int = 50) -> list:
    Q = load_sql("hotl")
    query = Q["list_base"]
    params: list = [tenant_id]
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
    tenant_id: str,
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
        tenant_id, agent, run_id, json.dumps(summary), cost_usd, total_tokens, langsmith_run_id, _now(),
    )
    return dict(row)


async def mark_hotl_read(conn, tenant_id: str, log_id: str) -> None:
    Q = load_sql("hotl")
    await conn.execute(Q["mark_read"], log_id, tenant_id)


async def mark_all_hotl_read(conn, tenant_id: str, agent: Optional[str] = None) -> None:
    Q = load_sql("hotl")
    if agent:
        await conn.execute(Q["mark_all_read_by_agent"], tenant_id, agent)
    else:
        await conn.execute(Q["mark_all_read"], tenant_id)


async def clear_hotl_logs(conn, tenant_id: str) -> None:
    Q = load_sql("hotl")
    await conn.execute(Q["clear_logs"], tenant_id)


# ── Run records ───────────────────────────────────────────────────────────────

async def list_runs_for_agent(conn, tenant_id: str, agent_name: str, limit: int = 20) -> list:
    Q = load_sql("runs")
    rows = await conn.fetch(Q["list_for_agent"], tenant_id, agent_name, min(limit, 100))
    return [dict(r) for r in rows]


async def list_runs(conn, tenant_id: str, agent: Optional[str] = None, limit: int = 50) -> list:
    Q = load_sql("runs")
    query = Q["list_base"]
    params: list = [tenant_id]
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    query += f" ORDER BY started_at DESC LIMIT {min(limit, 200)}"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


async def start_run(conn, tenant_id: str, agent: str, run_id: str) -> dict:
    Q = load_sql("runs")
    row = await conn.fetchrow(Q["start_run"], tenant_id, agent, run_id, _now())
    return dict(row)


async def finish_run(conn, tenant_id: str, run_id: str, status: str, token_count: int = 0, cost_usd: float = 0.0, error_msg: Optional[str] = None) -> Optional[dict]:
    Q = load_sql("runs")
    row = await conn.fetchrow(Q["finish_run"], _now(), status, token_count, cost_usd, error_msg, run_id, tenant_id)
    return dict(row) if row else None


# ── Schedules ─────────────────────────────────────────────────────────────────

async def list_schedules(conn, tenant_id: str, agent: Optional[str] = None) -> list:
    Q = load_sql("schedules")
    if agent:
        rows = await conn.fetch(Q["list_by_agent"], tenant_id, agent)
    else:
        rows = await conn.fetch(Q["list_all"], tenant_id)
    return [dict(r) for r in rows]


async def upsert_schedule(conn, tenant_id: str, agent: str, name: str, cron_expr: str, enabled: bool, task_prompt: Optional[str], thread_id: Optional[str] = None) -> dict:
    if thread_id is None:
        thread_id = make_thread_id(tenant_id, agent)
    Q = load_sql("schedules")
    row = await conn.fetchrow(Q["upsert"], tenant_id, agent, name, cron_expr, enabled, task_prompt, thread_id)
    return dict(row)


async def delete_schedule(conn, tenant_id: str, agent: str, name: str) -> None:
    Q = load_sql("schedules")
    await conn.execute(Q["delete"], tenant_id, agent, name)


# ── Stats ─────────────────────────────────────────────────────────────────────

async def get_stats(conn, tenant_id: str) -> dict:
    Q = load_sql("runs")
    rows = await conn.fetch(Q["stats_by_agent"], tenant_id)
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

async def get_agent_memory(conn, tenant_id: str, agent: str) -> str:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["get_agent_memory"], tenant_id, agent)
    return row["content"] if row else ""


async def upsert_agent_memory(conn, tenant_id: str, agent: str, content: str) -> None:
    Q = load_sql("agents")
    await conn.execute(Q["upsert_agent_memory"], tenant_id, agent, content)


async def get_agent_rules(conn, tenant_id: str, agent: str) -> str:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["get_agent_rules"], tenant_id, agent)
    return row["content"] if row else ""


async def upsert_agent_rules(conn, tenant_id: str, agent: str, content: str) -> None:
    Q = load_sql("agents")
    await conn.execute(Q["upsert_agent_rules"], tenant_id, agent, content)


# ── Tenant agents ─────────────────────────────────────────────────────────────

async def list_tenant_agents(conn, tenant_id: str, include_archived: bool = False) -> list:
    Q = load_sql("agents")
    key = "list_tenant_agents_with_archived" if include_archived else "list_tenant_agents"
    rows = await conn.fetch(Q[key], tenant_id)
    return [dict(r) for r in rows]


# ── Tenant agent configs ──────────────────────────────────────────────────────

async def get_tenant_agent_config(conn, tenant_id: str, agent: str) -> dict:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["get_agent_config"], tenant_id, agent)
    if row and row["config"]:
        config = row["config"]
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except Exception:
                config = {}
        return config
    return {}


async def upsert_tenant_agent_config(conn, tenant_id: str, agent: str, config: dict) -> dict:
    Q = load_sql("agents")
    row = await conn.fetchrow(Q["upsert_agent_config"], tenant_id, agent, json.dumps(config))
    if row and row["config"]:
        res_config = row["config"]
        if isinstance(res_config, str):
            try:
                res_config = json.loads(res_config)
            except Exception:
                res_config = {}
        return res_config
    return {}


# ── Admin ─────────────────────────────────────────────────────────────────────

async def get_tenant_name(conn, tenant_id: str) -> str:
    Q = load_sql("admin")
    row = await conn.fetchrow(Q["get_tenant_name"], tenant_id)
    return row["name"] if row else "Unknown"


async def get_tenant_id_for_agent(conn, agent_name: str) -> Optional[str]:
    Q = load_sql("admin")
    row = await conn.fetchrow(Q["get_tenant_id_for_agent"], agent_name)
    return row["tenant_id"] if row else None


async def list_tenants(conn) -> list:
    Q = load_sql("admin")
    rows = await conn.fetch(Q["list_tenants"])
    return [dict(r) for r in rows]


async def create_tenant(conn, name: str) -> dict:
    Q = load_sql("admin")
    row = await conn.fetchrow(Q["create_tenant"], name)
    return dict(row)


async def list_agent_registry(conn) -> list:
    Q = load_sql("admin")
    rows = await conn.fetch(Q["list_agent_registry"])
    return [dict(r) for r in rows]


async def assign_agent_to_tenant(conn, tenant_id: str, agent_name: str) -> dict:
    Q = load_sql("admin")
    row = await conn.fetchrow(Q["assign_agent_to_tenant"], tenant_id, agent_name)
    return dict(row) if row else {}


async def remove_agent_from_tenant(conn, tenant_id: str, agent_name: str) -> None:
    Q = load_sql("admin")
    await conn.execute(Q["remove_agent_from_tenant"], tenant_id, agent_name)


async def list_tenant_users(conn, tenant_id: str) -> list:
    Q = load_sql("admin")
    rows = await conn.fetch(Q["list_tenant_users"], tenant_id)
    return [dict(r) for r in rows]


async def add_user_to_tenant(conn, user_id: str, tenant_id: str) -> None:
    Q = load_sql("admin")
    await conn.execute(Q["add_user_to_tenant"], user_id, tenant_id)


async def remove_user_from_tenant(conn, user_id: str, tenant_id: str) -> None:
    Q = load_sql("admin")
    await conn.execute(Q["remove_user_from_tenant"], user_id, tenant_id)


# ── Search helpers ────────────────────────────────────────────────────────────

async def search_agent_memory(conn, tenant_id: str) -> list:
    Q = load_sql("agents")
    rows = await conn.fetch(Q["search_memory"], tenant_id)
    return [dict(r) for r in rows]


async def search_agent_rules(conn, tenant_id: str) -> list:
    Q = load_sql("agents")
    rows = await conn.fetch(Q["search_rules"], tenant_id)
    return [dict(r) for r in rows]


async def list_recent_runs(conn, tenant_id: str) -> list:
    Q = load_sql("runs")
    rows = await conn.fetch(Q["list_recent"], tenant_id)
    return [dict(r) for r in rows]
