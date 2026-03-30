"""
Minimal SQL file loader.

Files in backend/sql/*.sql use named query blocks:

    -- name: query_name
    SELECT ...
    ;

Usage:
    from backend.sql_loader import load_sql
    Q = load_sql("hotl")
    rows = await conn.fetch(Q["list_hotl_logs"], tenant_id)
"""
import re
from pathlib import Path

_CACHE: dict[str, dict[str, str]] = {}
_SQL_DIR = Path(__file__).parent / "sql"


def load_sql(domain: str) -> dict[str, str]:
    """Load named queries from backend/sql/{domain}.sql. Results are cached."""
    if domain in _CACHE:
        return _CACHE[domain]

    path = _SQL_DIR / f"{domain}.sql"
    if not path.exists():
        raise FileNotFoundError(f"SQL file not found: {path}")

    text = path.read_text()
    queries: dict[str, str] = {}
    # Split on '-- name: <identifier>' markers
    parts = re.split(r"--\s*name:\s*(\w+)", text)
    # parts = [preamble, name1, body1, name2, body2, ...]
    it = iter(parts[1:])
    for name, body in zip(it, it):
        queries[name.strip()] = body.strip().rstrip(";").strip()

    _CACHE[domain] = queries
    return queries
