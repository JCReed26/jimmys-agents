import pytest
from unittest.mock import AsyncMock, MagicMock

def make_conn(fetch_return=None, fetchrow_return=None):
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=fetch_return or [])
    conn.fetchrow = AsyncMock(return_value=fetchrow_return)
    conn.execute = AsyncMock(return_value="OK")
    return conn

@pytest.mark.asyncio
async def test_get_nav_counts():
    from backend.db_postgres import get_nav_counts
    conn = make_conn(fetchrow_return={"hitl": 3, "hotl_unread": 1})
    result = await get_nav_counts(conn)
    assert result == {"hitl": 3, "hotlUnread": 1}

@pytest.mark.asyncio
async def test_create_hitl_item():
    from backend.db_postgres import create_hitl_item
    conn = make_conn(fetchrow_return={
        "id": "abc", "agent": "budget-agent",
        "item_type": "approval", "payload": "{}", "status": "pending",
        "comment": None, "created_at": "2026-01-01T00:00:00Z", "resolved_at": None
    })
    result = await create_hitl_item(conn, "budget-agent", "approval", {"key": "val"})
    assert result["status"] == "pending"

@pytest.mark.asyncio
async def test_list_hitl_items_calls_db():
    from backend.db_postgres import list_hitl_items
    conn = make_conn(fetch_return=[])
    await list_hitl_items(conn)
    conn.fetch.assert_called_once()

@pytest.mark.asyncio
async def test_list_hotl_logs_calls_db():
    from backend.db_postgres import list_hotl_logs
    conn = make_conn(fetch_return=[])
    await list_hotl_logs(conn)
    conn.fetch.assert_called_once()

@pytest.mark.asyncio
async def test_get_stats_returns_structure():
    from backend.db_postgres import get_stats
    conn = make_conn(fetch_return=[])
    result = await get_stats(conn)
    assert "by_agent" in result

@pytest.mark.asyncio
async def test_thread_id_namespaced():
    from backend.db_postgres import make_thread_id
    tid = make_thread_id("budget-agent")
    assert tid.startswith("thread-budget-agent-")
    assert make_thread_id("budget-agent") != make_thread_id("budget-agent")

@pytest.mark.asyncio
async def test_upsert_schedule_generates_thread_id():
    from backend.db_postgres import upsert_schedule
    conn = make_conn(fetchrow_return={
        "id": "sched-1", "agent": "budget-agent",
        "name": "default", "cron_expr": "0 9 * * 1", "enabled": True,
        "task_prompt": "Run report", "thread_id": "thread-budget-agent-abc123"
    })
    result = await upsert_schedule(conn, "budget-agent", "default", "0 9 * * 1", True, "Run report")
    assert result["thread_id"].startswith("thread-budget-agent-")

@pytest.mark.asyncio
async def test_get_agent_memory():
    from backend.db_postgres import get_agent_memory
    conn = make_conn(fetchrow_return={"content": "client prefers weekly summaries"})
    result = await get_agent_memory(conn, "budget-agent")
    assert result == "client prefers weekly summaries"

@pytest.mark.asyncio
async def test_get_agent_memory_missing_returns_empty():
    from backend.db_postgres import get_agent_memory
    conn = make_conn(fetchrow_return=None)
    result = await get_agent_memory(conn, "budget-agent")
    assert result == ""
