"""
Postgres DB layer replacing backend/db.py (SQLite).
ALL functions require conn (asyncpg connection) + tenant_id.
Never query without tenant_id scoping.
"""
import json
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_thread_id(tenant_id: str, agent: str) -> str:
    """Generate a tenant-namespaced thread ID to prevent cross-tenant LangGraph mixing."""
    return f"thread-{tenant_id}-{agent}-{_uuid.uuid4().hex}"


# ── Nav counts ────────────────────────────────────────────────────────────────

async def get_nav_counts(conn, tenant_id: str) -> dict:
    row = await conn.fetchrow(
        """
        SELECT
          (SELECT COUNT(*) FROM hitl_items WHERE tenant_id=$1 AND status='pending') AS hitl,
          (SELECT COUNT(*) FROM hotl_logs  WHERE tenant_id=$1 AND is_read=false)    AS hotl_unread
        """,
        tenant_id,
    )
    return {"hitl": row["hitl"], "hotlUnread": row["hotl_unread"]}


# ── HITL ──────────────────────────────────────────────────────────────────────

async def list_hitl_items(conn, tenant_id: str, status: Optional[str] = None, agent: Optional[str] = None) -> list:
    query = "SELECT * FROM hitl_items WHERE tenant_id=$1"
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
    params: list = [tenant_id]
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
    params: list = [tenant_id]
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
    params: list = [tenant_id]
    if agent:
        params.append(agent)
        query += f" AND agent=${len(params)}"
    rows = await conn.fetch(query, *params)
    return [dict(r) for r in rows]


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


# ── Stats ─────────────────────────────────────────────────────────────────────

async def get_stats(conn, tenant_id: str) -> dict:
    rows = await conn.fetch(
        """
        SELECT agent,
               COUNT(*)                      AS runs,
               COALESCE(SUM(token_count), 0) AS tokens,
               COALESCE(SUM(cost_usd), 0)    AS cost
        FROM run_records
        WHERE tenant_id=$1
        GROUP BY agent
        """,
        tenant_id,
    )
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
        ON CONFLICT (tenant_id, agent) DO UPDATE SET content=$3, updated_at=now()
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
        ON CONFLICT (tenant_id, agent) DO UPDATE SET content=$3, updated_at=now()
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
