"""
SQLite state store for jimmys-agents dashboard.
All tables are created on first import.
"""
import sqlite3
import json
from pathlib import Path
from datetime import datetime, timezone

DB_PATH = Path(__file__).parent.parent / "data" / "state.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def migrate():
    """Idempotent schema creation."""
    with _conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS hitl_items (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent       TEXT    NOT NULL,
            item_type   TEXT    NOT NULL,
            payload     TEXT    NOT NULL,  -- JSON
            status      TEXT    NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
            comment     TEXT,
            created_at  TEXT    NOT NULL,
            resolved_at TEXT
        );

        CREATE TABLE IF NOT EXISTS hotl_logs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent       TEXT    NOT NULL,
            run_id      TEXT    NOT NULL,
            summary     TEXT    NOT NULL,  -- JSON: {tools:[{name,params,result}], thoughts:[], overview}
            is_read     INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS run_records (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent       TEXT    NOT NULL,
            run_id      TEXT    NOT NULL UNIQUE,
            started_at  TEXT    NOT NULL,
            finished_at TEXT,
            status      TEXT    NOT NULL DEFAULT 'running',  -- running|done|error
            token_count INTEGER DEFAULT 0,
            cost_usd    REAL    DEFAULT 0.0,
            error_msg   TEXT
        );

        CREATE TABLE IF NOT EXISTS schedules (
            agent       TEXT    PRIMARY KEY,
            cron_expr   TEXT    NOT NULL DEFAULT '0 */30 * * * *',
            enabled     INTEGER NOT NULL DEFAULT 1,
            task_prompt TEXT,
            last_run    TEXT,
            next_run    TEXT
        );

        CREATE TABLE IF NOT EXISTS stream_events (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            agent       TEXT    NOT NULL,
            run_id      TEXT    NOT NULL,
            event_type  TEXT    NOT NULL,  -- tool_call|thought|todo|text|done|error
            payload     TEXT    NOT NULL,  -- JSON
            seq         INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS council_contracts (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT    NOT NULL,
            parties     TEXT    NOT NULL,  -- JSON array of agent names
            terms_md    TEXT    NOT NULL,
            status      TEXT    NOT NULL DEFAULT 'draft',  -- draft|active|archived
            created_at  TEXT    NOT NULL,
            updated_at  TEXT    NOT NULL
        );

        CREATE TABLE IF NOT EXISTS council_messages (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            sender      TEXT    NOT NULL,  -- agent name or 'user'
            content     TEXT    NOT NULL,
            created_at  TEXT    NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_hitl_status    ON hitl_items(status);
        CREATE INDEX IF NOT EXISTS idx_hitl_agent     ON hitl_items(agent);
        CREATE INDEX IF NOT EXISTS idx_hotl_read      ON hotl_logs(is_read);
        CREATE INDEX IF NOT EXISTS idx_hotl_agent     ON hotl_logs(agent);
        CREATE INDEX IF NOT EXISTS idx_stream_run     ON stream_events(agent, run_id);
        CREATE INDEX IF NOT EXISTS idx_run_agent      ON run_records(agent);
        """)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ─────────────────────────────────────────
# HITL helpers
# ─────────────────────────────────────────

def hitl_create(agent: str, item_type: str, payload: dict) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO hitl_items (agent, item_type, payload, status, created_at) VALUES (?,?,?,?,?)",
            (agent, item_type, json.dumps(payload), "pending", now_iso()),
        )
        return cur.lastrowid


def hitl_get(item_id: int) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM hitl_items WHERE id=?", (item_id,)).fetchone()
        return dict(row) if row else None


def hitl_list(status: str | None = None, agent: str | None = None) -> list[dict]:
    with _conn() as conn:
        sql = "SELECT * FROM hitl_items WHERE 1=1"
        params = []
        if status:
            sql += " AND status=?"; params.append(status)
        if agent:
            sql += " AND agent=?"; params.append(agent)
        sql += " ORDER BY created_at DESC"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def hitl_resolve(item_id: int, decision: str, comment: str = "") -> bool:
    with _conn() as conn:
        affected = conn.execute(
            "UPDATE hitl_items SET status=?, comment=?, resolved_at=? WHERE id=? AND status='pending'",
            (decision, comment, now_iso(), item_id),
        ).rowcount
        return affected > 0


# ─────────────────────────────────────────
# HOTL helpers
# ─────────────────────────────────────────

def hotl_create(agent: str, run_id: str, summary: dict) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO hotl_logs (agent, run_id, summary, is_read, created_at) VALUES (?,?,?,0,?)",
            (agent, run_id, json.dumps(summary), now_iso()),
        )
        return cur.lastrowid


def hotl_list(agent: str | None = None, unread_only: bool = False) -> list[dict]:
    with _conn() as conn:
        sql = "SELECT * FROM hotl_logs WHERE 1=1"
        params = []
        if agent:
            sql += " AND agent=?"; params.append(agent)
        if unread_only:
            sql += " AND is_read=0"
        sql += " ORDER BY created_at DESC LIMIT 200"
        rows = conn.execute(sql, params).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["summary"] = json.loads(d["summary"])
            out.append(d)
        return out


def hotl_mark_read(log_id: int | None = None, agent: str | None = None):
    with _conn() as conn:
        if log_id:
            conn.execute("UPDATE hotl_logs SET is_read=1 WHERE id=?", (log_id,))
        elif agent:
            conn.execute("UPDATE hotl_logs SET is_read=1 WHERE agent=?", (agent,))
        else:
            conn.execute("UPDATE hotl_logs SET is_read=1")


# ─────────────────────────────────────────
# Run records
# ─────────────────────────────────────────

def run_start(agent: str, run_id: str) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT OR IGNORE INTO run_records (agent, run_id, started_at, status) VALUES (?,?,?,?)",
            (agent, run_id, now_iso(), "running"),
        )
        return cur.lastrowid


def run_finish(run_id: str, status: str, token_count: int = 0, cost_usd: float = 0.0, error_msg: str | None = None):
    with _conn() as conn:
        conn.execute(
            "UPDATE run_records SET finished_at=?, status=?, token_count=?, cost_usd=?, error_msg=? WHERE run_id=?",
            (now_iso(), status, token_count, cost_usd, error_msg, run_id),
        )


def run_list(agent: str | None = None, limit: int = 50) -> list[dict]:
    with _conn() as conn:
        sql = "SELECT * FROM run_records WHERE 1=1"
        params: list = []
        if agent:
            sql += " AND agent=?"; params.append(agent)
        sql += " ORDER BY started_at DESC LIMIT ?"
        params.append(limit)
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


# ─────────────────────────────────────────
# Schedules
# ─────────────────────────────────────────

def schedule_upsert(agent: str, cron_expr: str, enabled: bool = True, task_prompt: str = ""):
    with _conn() as conn:
        conn.execute(
            """INSERT INTO schedules (agent, cron_expr, enabled, task_prompt)
               VALUES (?,?,?,?)
               ON CONFLICT(agent) DO UPDATE SET
                 cron_expr=excluded.cron_expr,
                 enabled=excluded.enabled,
                 task_prompt=excluded.task_prompt""",
            (agent, cron_expr, 1 if enabled else 0, task_prompt),
        )


def schedule_list() -> list[dict]:
    with _conn() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM schedules ORDER BY agent").fetchall()]


def schedule_get(agent: str) -> dict | None:
    with _conn() as conn:
        r = conn.execute("SELECT * FROM schedules WHERE agent=?", (agent,)).fetchone()
        return dict(r) if r else None


def schedule_set_last_run(agent: str, next_run: str):
    with _conn() as conn:
        conn.execute(
            "UPDATE schedules SET last_run=?, next_run=? WHERE agent=?",
            (now_iso(), next_run, agent),
        )


# ─────────────────────────────────────────
# Stream events
# ─────────────────────────────────────────

def stream_event_append(agent: str, run_id: str, event_type: str, payload: dict, seq: int):
    with _conn() as conn:
        conn.execute(
            "INSERT INTO stream_events (agent, run_id, event_type, payload, seq, created_at) VALUES (?,?,?,?,?,?)",
            (agent, run_id, event_type, json.dumps(payload), seq, now_iso()),
        )


def stream_events_get(agent: str, run_id: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM stream_events WHERE agent=? AND run_id=? ORDER BY seq ASC",
            (agent, run_id),
        ).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["payload"] = json.loads(d["payload"])
            out.append(d)
        return out


# ─────────────────────────────────────────
# Council
# ─────────────────────────────────────────

def council_contract_create(title: str, parties: list[str], terms_md: str) -> int:
    with _conn() as conn:
        t = now_iso()
        cur = conn.execute(
            "INSERT INTO council_contracts (title, parties, terms_md, status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (title, json.dumps(parties), terms_md, "draft", t, t),
        )
        return cur.lastrowid


def council_contracts_list() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM council_contracts ORDER BY created_at DESC").fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["parties"] = json.loads(d["parties"])
            out.append(d)
        return out


def council_contract_update(contract_id: int, status: str | None = None, terms_md: str | None = None):
    with _conn() as conn:
        if status:
            conn.execute("UPDATE council_contracts SET status=?, updated_at=? WHERE id=?", (status, now_iso(), contract_id))
        if terms_md is not None:
            conn.execute("UPDATE council_contracts SET terms_md=?, updated_at=? WHERE id=?", (terms_md, now_iso(), contract_id))


def council_message_post(sender: str, content: str) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO council_messages (sender, content, created_at) VALUES (?,?,?)",
            (sender, content, now_iso()),
        )
        return cur.lastrowid


def council_messages_list(limit: int = 100) -> list[dict]:
    with _conn() as conn:
        return [
            dict(r) for r in conn.execute(
                "SELECT * FROM council_messages ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        ]


# Run migration on import
migrate()
