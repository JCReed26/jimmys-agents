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
