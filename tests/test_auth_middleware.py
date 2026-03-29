import pytest
import time
from jose import jwt
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

TEST_JWT_SECRET = "test-secret-32-chars-exactly-ok!"
TEST_TENANT_ID = "11111111-1111-1111-1111-111111111111"
TEST_USER_ID   = "22222222-2222-2222-2222-222222222222"
TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"

def make_token(user_id=TEST_USER_ID, secret=TEST_JWT_SECRET, expired=False):
    exp = time.time() + (-10 if expired else 3600)
    return jwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": int(exp), "iss": TEST_ISSUER},
        secret,
        algorithm="HS256",
    )

def make_app(monkeypatch, tenant_row={"tenant_id": TEST_TENANT_ID}):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=tenant_row)
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
        return {"tenant_id": request.state.tenant_id, "user_id": request.state.user_id}

    return app

def test_health_skips_auth(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/ok")
    assert resp.status_code == 200

def test_missing_token_returns_401(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/protected")
    assert resp.status_code == 401

def test_malformed_header_returns_401(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/protected", headers={"Authorization": "Basic abc123"})
    assert resp.status_code == 401

def test_invalid_token_returns_401(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    resp = client.get("/protected", headers={"Authorization": "Bearer notavalidtoken"})
    assert resp.status_code == 401

def test_expired_token_returns_401(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    token = make_token(expired=True)
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401

def test_wrong_secret_returns_401(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    token = make_token(secret="completely-different-secret-xyz!")
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401

def test_valid_token_attaches_tenant_and_user(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    token = make_token()
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["tenant_id"] == TEST_TENANT_ID
    assert resp.json()["user_id"] == TEST_USER_ID

def test_no_tenant_returns_403(monkeypatch):
    app = make_app(monkeypatch, tenant_row=None)
    client = TestClient(app, raise_server_exceptions=False)
    token = make_token()
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
