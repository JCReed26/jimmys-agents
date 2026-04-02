import os
from fastapi import Request
from fastapi.responses import JSONResponse
from jose import jwt, JWTError

SKIP_PATHS = {"/ok", "/docs", "/openapi.json", "/redoc"}

# Internal key bypass: agents posting HOTL logs or HITL requests don't carry a JWT.
# Applies to POST /hotl and POST /hitl. Disabled entirely if INTERNAL_API_KEY is unset.
_INTERNAL_BYPASS_PATHS = {"/hotl", "/hitl"}
_INTERNAL_BYPASS_METHOD = "POST"


def _get_internal_api_key() -> str:
    return os.environ.get("INTERNAL_API_KEY", "")


def validate_env() -> None:
    """Call during app startup to fail fast if required vars are missing."""
    if not os.environ.get("SUPABASE_JWT_SECRET"):
        raise RuntimeError("SUPABASE_JWT_SECRET env var is not set")
    if not os.environ.get("SUPABASE_URL"):
        raise RuntimeError("SUPABASE_URL env var is not set")


def _get_jwt_secret() -> str:
    return os.environ["SUPABASE_JWT_SECRET"]


def _get_issuer() -> str:
    """Supabase JWT issuer — prevents tokens from other Supabase projects being accepted."""
    url = os.environ.get("SUPABASE_URL", "")
    return f"{url}/auth/v1" if url else ""


async def auth_middleware(request: Request, call_next):
    if request.url.path in SKIP_PATHS:
        return await call_next(request)

    # Internal agent bypass: POST /hotl and POST /hitl, only when INTERNAL_API_KEY is configured.
    internal_key = _get_internal_api_key()
    if (
        internal_key
        and request.method == _INTERNAL_BYPASS_METHOD
        and request.url.path in _INTERNAL_BYPASS_PATHS
    ):
        provided = request.headers.get("X-Internal-Key", "")
        if provided == internal_key:
            request.state.user_id = "internal"
            return await call_next(request)
        # Key was provided but wrong — fail immediately (don't fall through to JWT)
        return JSONResponse(status_code=401, content={"detail": "Invalid internal key"})

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Missing auth token"})

    token = auth_header.removeprefix("Bearer ").strip()

    try:
        issuer = _get_issuer()
        payload = jwt.decode(
            token,
            _get_jwt_secret(),
            algorithms=["HS256"],
            audience="authenticated",
            issuer=issuer,
            options={"verify_iss": True},
        )
    except JWTError:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired token"})

    user_id = payload.get("sub")
    if not user_id:
        return JSONResponse(status_code=401, content={"detail": "Token missing sub claim"})

    request.state.user_id = user_id
    return await call_next(request)
