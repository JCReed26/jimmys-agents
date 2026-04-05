import time
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.backends import default_backend
from jose import jwt
from jose.utils import base64url_encode
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

TEST_USER_ID = "22222222-2222-2222-2222-222222222222"
TEST_SUPABASE_URL = "https://test.supabase.co"
TEST_ISSUER = f"{TEST_SUPABASE_URL}/auth/v1"

_key = ec.generate_private_key(ec.SECP256R1(), default_backend())
_pub = _key.public_key().public_numbers()


def _b64(n): return base64url_encode(n.to_bytes(32, "big")).decode()


PRIVATE_JWK = {
    "kty": "EC", "crv": "P-256", "alg": "ES256",
    "x": _b64(_pub.x), "y": _b64(_pub.y),
    "d": _b64(_key.private_numbers().private_value),
}
PUBLIC_JWK = {"kty": "EC", "crv": "P-256", "alg": "ES256", "x": _b64(_pub.x), "y": _b64(_pub.y)}


def make_token(user_id=TEST_USER_ID, expired=False, issuer=TEST_ISSUER):
    exp = int(time.time()) + (-10 if expired else 3600)
    return jwt.encode(
        {"sub": user_id, "aud": "authenticated", "exp": exp, "iss": issuer},
        PRIVATE_JWK, algorithm="ES256",
    )


def make_app(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", TEST_SUPABASE_URL)
    import backend.auth_middleware as m
    m._jwks = [PUBLIC_JWK]  # inject test key, skip network
    from backend.auth_middleware import auth_middleware
    app = FastAPI()
    app.middleware("http")(auth_middleware)

    @app.get("/ok")
    async def health(): return {"ok": True}

    @app.get("/protected")
    async def protected(request: Request): return {"user_id": request.state.user_id}

    return app


def test_health_skips_auth(monkeypatch):
    client = TestClient(make_app(monkeypatch), raise_server_exceptions=False)
    assert client.get("/ok").status_code == 200

def test_missing_token_returns_401(monkeypatch):
    client = TestClient(make_app(monkeypatch), raise_server_exceptions=False)
    assert client.get("/protected").status_code == 401

def test_malformed_header_returns_401(monkeypatch):
    client = TestClient(make_app(monkeypatch), raise_server_exceptions=False)
    assert client.get("/protected", headers={"Authorization": "Basic abc"}).status_code == 401

def test_invalid_token_returns_401(monkeypatch):
    client = TestClient(make_app(monkeypatch), raise_server_exceptions=False)
    assert client.get("/protected", headers={"Authorization": "Bearer notatoken"}).status_code == 401

def test_expired_token_returns_401(monkeypatch):
    client = TestClient(make_app(monkeypatch), raise_server_exceptions=False)
    token = make_token(expired=True)
    assert client.get("/protected", headers={"Authorization": f"Bearer {token}"}).status_code == 401

def test_wrong_issuer_returns_401(monkeypatch):
    client = TestClient(make_app(monkeypatch), raise_server_exceptions=False)
    token = make_token(issuer="https://evil.supabase.co/auth/v1")
    assert client.get("/protected", headers={"Authorization": f"Bearer {token}"}).status_code == 401

def test_valid_token_attaches_user_id(monkeypatch):
    client = TestClient(make_app(monkeypatch), raise_server_exceptions=False)
    token = make_token()
    resp = client.get("/protected", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json()["user_id"] == TEST_USER_ID

def test_wrong_key_returns_401(monkeypatch):
    app = make_app(monkeypatch)
    other = ec.generate_private_key(ec.SECP256R1(), default_backend()).public_key().public_numbers()
    import backend.auth_middleware as m
    m._jwks = [{"kty": "EC", "crv": "P-256", "alg": "ES256", "x": _b64(other.x), "y": _b64(other.y)}]
    token = make_token()
    client = TestClient(app, raise_server_exceptions=False)
    assert client.get("/protected", headers={"Authorization": f"Bearer {token}"}).status_code == 401
