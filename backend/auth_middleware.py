import logging
import os
import traceback

import httpx
from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt

logger = logging.getLogger(__name__)

SKIP_PATHS = {"/ok", "/docs", "/openapi.json", "/redoc"}
_INTERNAL_PATHS = {"/hotl", "/hitl"}
_jwks: list = []  # fetched once on first authenticated request


def validate_env() -> None:
    """Called during app startup to fail fast if required vars are missing."""
    if not os.environ.get("SUPABASE_URL"):
        raise RuntimeError("SUPABASE_URL env var is not set")


async def auth_middleware(request: Request, call_next):
    if request.url.path in SKIP_PATHS:
        return await call_next(request)

    # Agents post HITL/HOTL with X-Internal-Key instead of JWT
    if request.method == "POST" and request.url.path in _INTERNAL_PATHS:
        key = os.environ.get("INTERNAL_API_KEY", "")
        if key and request.headers.get("X-Internal-Key") == key:
            request.state.user_id = "internal"
            return await call_next(request)

    token = request.headers.get("Authorization", "")[len("Bearer "):].strip()
    if not token:
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)

    try:
        global _jwks
        if not _jwks:
            async with httpx.AsyncClient() as c:
                r = await c.get(f"{os.environ['SUPABASE_URL']}/auth/v1/.well-known/jwks.json")
                _jwks = r.json()["keys"]

        header = jwt.get_unverified_header(token)
        key = next((k for k in _jwks if k.get("kid") == header.get("kid")), _jwks[0])
        payload = jwt.decode(
            token, key,
            algorithms=[header["alg"]],
            audience="authenticated",
            issuer=f"{os.environ['SUPABASE_URL']}/auth/v1",
        )
        request.state.user_id = payload["sub"]
        return await call_next(request)
    except Exception as e:
        logger.warning("Auth failed: %s\n%s", e, traceback.format_exc())
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
