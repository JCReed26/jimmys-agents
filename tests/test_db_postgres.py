import pytest
from unittest.mock import AsyncMock, MagicMock

TENANT_ID = "11111111-1111-1111-1111-111111111111"
OTHER_TENANT = "22222222-2222-2222-2222-222222222222"

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
    result = await get_nav_counts(conn, TENANT_ID)
    assert result == {"hitl": 3, "hotlUnread": 1}
    # Verify tenant_id is passed to query
    call_args = str(conn.fetchrow.call_args)
    assert TENANT_ID in call_args

@pytest.mark.asyncio
async def test_create_hitl_item():
    from backend.db_postgres import create_hitl_item
    conn = make_conn(fetchrow_return={
        "id": "abc", "tenant_id": TENANT_ID, "agent": "budget-agent",
        "item_type": "approval", "payload": "{}", "status": "pending",
        "comment": None, "created_at": "2026-01-01T00:00:00Z", "resolved_at": None
    })
    result = await create_hitl_item(conn, TENANT_ID, "budget-agent", "approval", {"key": "val"})
    assert result["status"] == "pending"
    assert result["tenant_id"] == TENANT_ID
    call_args = str(conn.fetchrow.call_args)
    assert TENANT_ID in call_args

@pytest.mark.asyncio
async def test_list_hitl_items_scoped_to_tenant():
    from backend.db_postgres import list_hitl_items
    conn = make_conn(fetch_return=[])
    await list_hitl_items(conn, TENANT_ID)
    call_args = str(conn.fetch.call_args)
    assert TENANT_ID in call_args
    assert OTHER_TENANT not in call_args

@pytest.mark.asyncio
async def test_list_hotl_logs_scoped_to_tenant():
    from backend.db_postgres import list_hotl_logs
    conn = make_conn(fetch_return=[])
    await list_hotl_logs(conn, TENANT_ID)
    call_args = str(conn.fetch.call_args)
    assert TENANT_ID in call_args

@pytest.mark.asyncio
async def test_get_stats_scoped_to_tenant():
    from backend.db_postgres import get_stats
    conn = make_conn(fetch_return=[])
    result = await get_stats(conn, TENANT_ID)
    assert "by_agent" in result
    call_args = str(conn.fetch.call_args)
    assert TENANT_ID in call_args

@pytest.mark.asyncio
async def test_thread_id_namespaced():
    from backend.db_postgres import make_thread_id
    tid = make_thread_id(TENANT_ID, "budget-agent")
    assert tid.startswith(f"thread-{TENANT_ID}-budget-agent-")
    # Different calls produce different IDs
    assert make_thread_id(TENANT_ID, "budget-agent") != make_thread_id(TENANT_ID, "budget-agent")

@pytest.mark.asyncio
async def test_upsert_schedule_generates_thread_id():
    from backend.db_postgres import upsert_schedule
    conn = make_conn(fetchrow_return={
        "id": "sched-1", "tenant_id": TENANT_ID, "agent": "budget-agent",
        "workflow": "default", "cron_expr": "0 9 * * 1", "enabled": True,
        "task_prompt": "Run report", "last_run": None, "next_run": None,
        "thread_id": f"thread-{TENANT_ID}-budget-agent-abc123"
    })
    result = await upsert_schedule(conn, TENANT_ID, "budget-agent", "default", "0 9 * * 1", True, "Run report")
    assert result["thread_id"].startswith(f"thread-{TENANT_ID}-budget-agent-")

@pytest.mark.asyncio
async def test_get_agent_memory():
    from backend.db_postgres import get_agent_memory
    conn = make_conn(fetchrow_return={"content": "client prefers weekly summaries"})
    result = await get_agent_memory(conn, TENANT_ID, "budget-agent")
    assert result == "client prefers weekly summaries"
    call_args = str(conn.fetchrow.call_args)
    assert TENANT_ID in call_args

@pytest.mark.asyncio
async def test_get_agent_memory_missing_returns_empty():
    from backend.db_postgres import get_agent_memory
    conn = make_conn(fetchrow_return=None)
    result = await get_agent_memory(conn, TENANT_ID, "budget-agent")
    assert result == ""
