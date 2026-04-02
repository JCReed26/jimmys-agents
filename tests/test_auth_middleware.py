import pytest
import time
from jose import jwt
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

TEST_JWT_SECRET = "test-secret-32-chars-exactly-ok!"
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

def make_app(monkeypatch):
    monkeypatch.setenv("SUPABASE_JWT_SECRET", TEST_JWT_SECRET)
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)

    from backend.auth_middleware import auth_middleware
    app = FastAPI()
    app.middleware("http")(auth_middleware)

    @app.get("/ok")
    async def health():
        return {"ok": True}

    @app.get("/protected")
    async def protected(request: Request):
        return {"user_id": request.state.user_id}

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

def test_valid_token_attaches_user_id(monkeypatch):
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    token = make_token()
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == TEST_USER_ID

def test_wrong_issuer_returns_401(monkeypatch):
    """Token signed with correct secret but from a different Supabase project must be rejected."""
    app = make_app(monkeypatch)
    client = TestClient(app, raise_server_exceptions=False)
    token = jwt.encode(
        {
            "sub": TEST_USER_ID,
            "aud": "authenticated",
            "exp": int(time.time() + 3600),
            "iss": "https://other-project.supabase.co/auth/v1",  # wrong issuer
        },
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401
