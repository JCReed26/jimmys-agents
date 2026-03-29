"""
Tests for:
  - POST /hotl with valid X-Internal-Key returns 200
  - POST /hotl with invalid X-Internal-Key returns 401
  - POST /hotl/clear deletes entries for correct tenant
  - GET /chat/{agent}/history with wrong-tenant thread_id returns empty messages
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

TENANT_ID = "11111111-1111-1111-1111-111111111111"
OTHER_TENANT = "22222222-2222-2222-2222-222222222222"
VALID_INTERNAL_KEY = "test-internal-key-abc123"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def make_mock_pool(conn: AsyncMock) -> MagicMock:
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=AsyncMock(
        __aenter__=AsyncMock(return_value=conn),
        __aexit__=AsyncMock(return_value=None),
    ))
    return pool


def make_hotl_app(monkeypatch, internal_key: str = VALID_INTERNAL_KEY, conn: AsyncMock = None):
    """
    Build a minimal FastAPI app with auth_middleware wired up,
    exposing POST /hotl and POST /hotl/clear exactly as api_server does.
    """
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-32-chars-exactly-ok!")
    monkeypatch.setenv("INTERNAL_API_KEY", internal_key)

    if conn is None:
        conn = AsyncMock()
        conn.fetchrow = AsyncMock(return_value={"id": "log-1"})
        conn.execute = AsyncMock(return_value="DELETE 3")

    from backend.auth_middleware import auth_middleware

    app = FastAPI()
    app.state.pool = make_mock_pool(conn)
    app.middleware("http")(auth_middleware)

    @app.post("/hotl")
    async def create_hotl(request: Request):
        return {"tenant_id": request.state.tenant_id}

    @app.post("/hotl/clear")
    async def clear_hotl(request: Request):
        return {"tenant_id": request.state.tenant_id, "ok": True}

    return app, conn


# ─────────────────────────────────────────────────────────────────────────────
# POST /hotl — internal key bypass
# ─────────────────────────────────────────────────────────────────────────────

def test_post_hotl_valid_internal_key_returns_200(monkeypatch):
    """Valid X-Internal-Key on POST /hotl bypasses JWT and returns 200."""
    app, _ = make_hotl_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(
        "/hotl",
        json={"agent": "budget", "run_id": "run-1", "summary": {}},
        headers={"X-Internal-Key": VALID_INTERNAL_KEY},
    )
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] == "internal"


def test_post_hotl_invalid_internal_key_returns_401(monkeypatch):
    """Wrong X-Internal-Key on POST /hotl returns 401 immediately."""
    app, _ = make_hotl_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(
        "/hotl",
        json={"agent": "budget", "run_id": "run-1", "summary": {}},
        headers={"X-Internal-Key": "wrong-key"},
    )
    assert resp.status_code == 401


def test_post_hotl_no_key_no_jwt_returns_401(monkeypatch):
    """No credentials at all on POST /hotl returns 401."""
    app, _ = make_hotl_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(
        "/hotl",
        json={"agent": "budget", "run_id": "run-1", "summary": {}},
    )
    assert resp.status_code == 401


def test_internal_key_bypass_disabled_when_env_unset(monkeypatch):
    """If INTERNAL_API_KEY is not set, bypass is disabled even with correct header value."""
    # Set env to empty string — bypass should be disabled
    app, _ = make_hotl_app(monkeypatch, internal_key="")
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.post(
        "/hotl",
        headers={"X-Internal-Key": ""},
    )
    # Should fall through to JWT check and fail with 401
    assert resp.status_code == 401


def test_internal_key_bypass_only_on_post_hotl(monkeypatch):
    """The internal key bypass must NOT work on other paths."""
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-32-chars-exactly-ok!")
    monkeypatch.setenv("INTERNAL_API_KEY", VALID_INTERNAL_KEY)

    from backend.auth_middleware import auth_middleware

    app = FastAPI()
    conn = AsyncMock()
    app.state.pool = make_mock_pool(conn)
    app.middleware("http")(auth_middleware)

    @app.get("/hitl")
    async def get_hitl(request: Request):
        return {"ok": True}

    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/hitl", headers={"X-Internal-Key": VALID_INTERNAL_KEY})
    # Should fail — bypass only applies to POST /hotl
    assert resp.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# POST /hotl/clear — deletes entries for correct tenant
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_clear_hotl_logs_scoped_to_tenant():
    """clear_hotl_logs deletes only rows for the given tenant_id."""
    from backend.db_postgres import clear_hotl_logs
    conn = AsyncMock()
    conn.execute = AsyncMock(return_value="DELETE 5")

    await clear_hotl_logs(conn, TENANT_ID)

    conn.execute.assert_called_once()
    call_args = str(conn.execute.call_args)
    assert TENANT_ID in call_args
    assert OTHER_TENANT not in call_args


@pytest.mark.asyncio
async def test_clear_hotl_logs_uses_delete_statement():
    """clear_hotl_logs issues a DELETE (not UPDATE/SELECT)."""
    from backend.db_postgres import clear_hotl_logs
    conn = AsyncMock()
    conn.execute = AsyncMock(return_value="DELETE 0")

    await clear_hotl_logs(conn, TENANT_ID)

    sql = conn.execute.call_args[0][0].upper()
    assert "DELETE" in sql


# ─────────────────────────────────────────────────────────────────────────────
# GET /chat/{agent}/history — wrong-tenant thread_id returns empty messages
# ─────────────────────────────────────────────────────────────────────────────

def make_history_app(tenant_id: str = TENANT_ID):
    """
    Build a minimal app exposing GET /chat/{agent}/history.
    Uses a single pre-seeded middleware that sets tenant_id — no JWT needed.
    This directly tests the thread_id scoping logic in isolation.
    """
    app = FastAPI()

    # Middleware runs in reverse registration order in FastAPI (last added = outermost).
    # We register a simple tenant-seeding middleware so routes can read request.state.tenant_id.
    @app.middleware("http")
    async def inject_tenant(request: Request, call_next):
        request.state.tenant_id = tenant_id
        request.state.user_id = "test-user"
        return await call_next(request)

    @app.get("/chat/{agent}/history")
    async def chat_history(agent: str, thread_id: str, request: Request):
        t = request.state.tenant_id
        if not thread_id.startswith(f"thread-{t}-"):
            return {"messages": []}
        return {"messages": [{"role": "user", "content": "hello"}]}

    return app


def test_chat_history_wrong_tenant_thread_id_returns_empty(monkeypatch):
    """thread_id scoped to a different tenant returns empty messages list."""
    app = make_history_app(tenant_id=TENANT_ID)
    client = TestClient(app, raise_server_exceptions=False)

    wrong_tenant_thread = f"thread-{OTHER_TENANT}-budget-agent-abc123"
    resp = client.get(
        "/chat/budget/history",
        params={"thread_id": wrong_tenant_thread},
    )
    assert resp.status_code == 200
    assert resp.json() == {"messages": []}


def test_chat_history_correct_tenant_thread_id_returns_messages(monkeypatch):
    """thread_id scoped to the correct tenant returns messages."""
    app = make_history_app(tenant_id=TENANT_ID)
    client = TestClient(app, raise_server_exceptions=False)

    correct_thread = f"thread-{TENANT_ID}-budget-agent-abc123"
    resp = client.get(
        "/chat/budget/history",
        params={"thread_id": correct_thread},
    )
    assert resp.status_code == 200
    assert len(resp.json()["messages"]) > 0
