"""
Tests for the HOTL data pipeline:
- create_hotl_log with cost/token/langsmith fields
- list_runs_for_agent scoped to tenant
- POST /hotl with internal key resolves agent_name to real tenant
"""
import os
import sys

# Add the project root to sys.path BEFORE any other imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

TENANT_ID = "4efdeb00-1b23-4031-bc77-555af005a406"
OTHER_TENANT = "22222222-2222-2222-2222-222222222222"
AGENT_NAME = "budget-deepagent"


def make_conn(fetch_return=None, fetchrow_return=None):
    conn = AsyncMock()
    conn.fetch = AsyncMock(return_value=fetch_return or [])
    conn.fetchrow = AsyncMock(return_value=fetchrow_return)
    conn.execute = AsyncMock(return_value="OK")
    return conn


# ── create_hotl_log ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_hotl_log_with_cost_fields():
    """create_hotl_log persists cost_usd, total_tokens, langsmith_run_id."""
    from backend.db_postgres import create_hotl_log
    conn = make_conn(fetchrow_return={
        "id": "log-1",
        "tenant_id": TENANT_ID,
        "agent": AGENT_NAME,
        "run_id": "run-abc",
        "summary": json.dumps({"overview": "did stuff"}),
        "cost_usd": 0.0012,
        "total_tokens": 1500,
        "langsmith_run_id": "ls-xyz",
        "is_read": False,
        "created_at": "2026-01-01T00:00:00Z",
    })

    result = await create_hotl_log(
        conn,
        TENANT_ID,
        AGENT_NAME,
        "run-abc",
        {"overview": "did stuff"},
        cost_usd=0.0012,
        total_tokens=1500,
        langsmith_run_id="ls-xyz",
    )

    assert result["id"] == "log-1"
    assert result["cost_usd"] == 0.0012
    assert result["total_tokens"] == 1500
    assert result["langsmith_run_id"] == "ls-xyz"

    # Verify params were passed to the INSERT
    call_args = conn.fetchrow.call_args
    positional = call_args[0]
    assert TENANT_ID in positional
    assert AGENT_NAME in positional
    assert 0.0012 in positional
    assert 1500 in positional
    assert "ls-xyz" in positional


@pytest.mark.asyncio
async def test_create_hotl_log_without_optional_fields():
    """create_hotl_log works when cost/token/langsmith fields are omitted (None)."""
    from backend.db_postgres import create_hotl_log
    conn = make_conn(fetchrow_return={
        "id": "log-2",
        "tenant_id": TENANT_ID,
        "agent": AGENT_NAME,
        "run_id": "run-xyz",
        "summary": json.dumps({"overview": "minimal"}),
        "cost_usd": None,
        "total_tokens": None,
        "langsmith_run_id": None,
        "is_read": False,
        "created_at": "2026-01-01T00:00:00Z",
    })

    result = await create_hotl_log(
        conn, TENANT_ID, AGENT_NAME, "run-xyz", {"overview": "minimal"}
    )

    assert result["id"] == "log-2"
    assert result["cost_usd"] is None
    assert result["total_tokens"] is None
    assert result["langsmith_run_id"] is None

    # None values should still be passed positionally
    call_args = conn.fetchrow.call_args
    positional = call_args[0]
    assert None in positional


# ── list_runs_for_agent ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_runs_for_agent_scoped_to_tenant():
    """list_runs_for_agent queries only the specified tenant and agent."""
    from backend.db_postgres import list_runs_for_agent
    conn = make_conn(fetch_return=[
        {
            "id": "r1", "status": "done", "cost_usd": 0.001,
            "total_tokens": 1000, "started_at": "2026-01-01T00:00:00Z",
            "ended_at": "2026-01-01T00:01:00Z", "langsmith_run_id": "ls-1",
        }
    ])

    results = await list_runs_for_agent(conn, TENANT_ID, AGENT_NAME, limit=20)

    assert len(results) == 1
    assert results[0]["id"] == "r1"
    assert results[0]["status"] == "done"

    call_args = conn.fetch.call_args
    positional = call_args[0]
    assert TENANT_ID in positional
    assert AGENT_NAME in positional
    # limit is capped
    assert 20 in positional


@pytest.mark.asyncio
async def test_list_runs_for_agent_caps_limit():
    """list_runs_for_agent caps limit at 100."""
    from backend.db_postgres import list_runs_for_agent
    conn = make_conn(fetch_return=[])

    await list_runs_for_agent(conn, TENANT_ID, AGENT_NAME, limit=9999)

    call_args = conn.fetch.call_args
    positional = call_args[0]
    assert 100 in positional
    assert 9999 not in positional


@pytest.mark.asyncio
async def test_list_runs_for_agent_returns_correct_fields():
    """list_runs_for_agent returns id, status, cost_usd, total_tokens, started_at, ended_at, langsmith_run_id."""
    from backend.db_postgres import list_runs_for_agent
    conn = make_conn(fetch_return=[
        {
            "id": "r2",
            "status": "done",
            "cost_usd": 0.0025,
            "total_tokens": 2500,
            "started_at": "2026-01-02T10:00:00Z",
            "ended_at": "2026-01-02T10:02:00Z",
            "langsmith_run_id": "ls-run-42",
        }
    ])

    results = await list_runs_for_agent(conn, TENANT_ID, AGENT_NAME)

    assert results[0]["cost_usd"] == 0.0025
    assert results[0]["total_tokens"] == 2500
    assert results[0]["langsmith_run_id"] == "ls-run-42"
    assert "started_at" in results[0]
    assert "ended_at" in results[0]


# ── POST /hotl internal key tenant resolution ─────────────────────────────────

@pytest.mark.asyncio
async def test_post_hotl_internal_key_resolves_tenant():
    """POST /hotl with internal key looks up tenant from tenant_agents table."""
    from backend.api_server import app
    from fastapi.testclient import TestClient
    from unittest.mock import patch, AsyncMock


    # Mock pool and DB calls
    mock_conn = AsyncMock()
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=None)

    # First fetchrow: tenant lookup returns TENANT_ID
    # Second fetchrow: create_hotl_log insert
    mock_conn.fetchrow = AsyncMock(side_effect=[
        {"tenant_id": TENANT_ID},  # tenant lookup
        {                           # hotl_logs INSERT
            "id": "log-new",
            "tenant_id": TENANT_ID,
            "agent": AGENT_NAME,
            "run_id": "run-1",
            "summary": json.dumps({"overview": "budget run"}),
            "cost_usd": 0.001,
            "total_tokens": 800,
            "langsmith_run_id": None,
            "is_read": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
    ])

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_conn)

    import os
    os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
    os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("DATABASE_URL", "postgresql://test")

    with patch("backend.api_server._pool", mock_pool), \
         patch("backend.api_server.asyncpg.create_pool", AsyncMock(return_value=mock_pool)):
        from backend.api_server import app
        from fastapi.testclient import TestClient

        app.state.pool = mock_pool

        client = TestClient(app, raise_server_exceptions=True)
        response = client.post(
            "/hotl",
            headers={"X-Internal-Key": "test-internal-key"},
            json={
                "agent_name": AGENT_NAME,
                "overview": "budget run completed",
                "tools": ["read_file", "write_file"],
                "thoughts": "analyzed expenses",
                "cost_usd": 0.001,
                "total_tokens": 800,
            },
        )

    assert response.status_code == 200
    data = response.json()
    assert "id" in data


@pytest.mark.asyncio
async def test_post_hotl_internal_key_unknown_agent_falls_back_to_james():
    """POST /hotl with unknown agent_name falls back to James's tenant ID."""
    from backend.api_server import app, JAMES_TENANT_ID
    from unittest.mock import patch, AsyncMock, MagicMock

    mock_conn = AsyncMock()
    mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_conn.__aexit__ = AsyncMock(return_value=None)

    mock_conn.fetchrow = AsyncMock(side_effect=[
        None,  # tenant lookup — agent not found
        {      # hotl_logs INSERT
            "id": "log-fallback",
            "tenant_id": TENANT_ID,
            "agent": "unknown-agent",
            "run_id": "run-2",
            "summary": json.dumps({"overview": "fallback"}),
            "cost_usd": None,
            "total_tokens": None,
            "langsmith_run_id": None,
            "is_read": False,
            "created_at": "2026-01-01T00:00:00Z",
        },
    ])

    mock_pool = MagicMock()
    mock_pool.acquire = MagicMock(return_value=mock_conn)

    import os
    os.environ.setdefault("INTERNAL_API_KEY", "test-internal-key")
    os.environ.setdefault("SUPABASE_JWT_SECRET", "test-secret")
    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("DATABASE_URL", "postgresql://test")

    with patch("backend.api_server._pool", mock_pool):
        from backend.api_server import app, JAMES_TENANT_ID
        app.state.pool = mock_pool

        from fastapi.testclient import TestClient
        client = TestClient(app, raise_server_exceptions=True)
        response = client.post(
            "/hotl",
            headers={"X-Internal-Key": "test-internal-key"},
            json={"agent_name": "unknown-agent", "overview": "test"},
        )

    assert response.status_code == 200
    # Verify the second fetchrow (INSERT) was called with James's tenant ID
    insert_call_args = mock_conn.fetchrow.call_args_list[1][0]
    assert JAMES_TENANT_ID in insert_call_args
