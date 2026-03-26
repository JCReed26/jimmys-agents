import json
import sqlite3
import time
import uuid
import os
from typing import Optional
from langchain_core.callbacks import BaseCallbackHandler

DB_PATH = os.environ.get("METRICS_DB_PATH", "data/metrics.db")


def init_db(db_path: str = DB_PATH):
    """Create the agent_runs table if it doesn't exist."""
    dirname = os.path.dirname(db_path)
    os.makedirs(dirname or ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_runs (
            id                TEXT PRIMARY KEY,
            agent_name        TEXT NOT NULL,
            started_at        INTEGER NOT NULL,
            ended_at          INTEGER,
            duration_ms       INTEGER,
            llm_calls         INTEGER DEFAULT 0,
            tool_calls        TEXT,
            total_tokens      INTEGER,
            prompt_tokens     INTEGER,
            completion_tokens INTEGER,
            error             TEXT,
            langsmith_run_id  TEXT
        )
    """)
    conn.commit()
    conn.close()


class MetricsCallback(BaseCallbackHandler):
    """Writes per-run metrics to SQLite. LangSmith handled via env vars."""

    def __init__(self, agent_name: str, db_path: str = DB_PATH):
        self.agent_name = agent_name
        self.db_path = db_path
        init_db(db_path)
        self._reset()

    def _reset(self):
        self._run_id = str(uuid.uuid4())
        self._started_at: Optional[int] = None
        self._llm_calls = 0
        self._tool_calls: list[dict] = []
        self._total_tokens = 0
        self._prompt_tokens = 0
        self._completion_tokens = 0
        self._current_tool_start: Optional[float] = None
        self._current_tool_name: Optional[str] = None
        self._langsmith_run_id: Optional[str] = None

    def on_chain_start(self, serialized, inputs, **kwargs):
        self._reset()
        self._started_at = int(time.time() * 1000)
        run_id = kwargs.get("run_id")
        if run_id is not None:
            self._langsmith_run_id = str(run_id)

    def on_llm_end(self, response, **kwargs):
        self._llm_calls += 1
        usage = getattr(response, "llm_output", {}) or {}
        token_usage = usage.get("token_usage", {})
        self._total_tokens += token_usage.get("total_tokens", 0)
        self._prompt_tokens += token_usage.get("prompt_tokens", 0)
        self._completion_tokens += token_usage.get("completion_tokens", 0)

    def on_tool_start(self, serialized, input_str, **kwargs):
        self._current_tool_name = serialized.get("name", "unknown")
        self._current_tool_start = time.time()

    def on_tool_end(self, output, **kwargs):
        if self._current_tool_start:
            duration_ms = int((time.time() - self._current_tool_start) * 1000)
            self._tool_calls.append({
                "name": self._current_tool_name,
                "duration_ms": duration_ms,
                "success": True,
                "output_len": len(str(output)),
            })
        self._current_tool_start = None
        self._current_tool_name = None

    def on_tool_error(self, error, **kwargs):
        if self._current_tool_start:
            duration_ms = int((time.time() - self._current_tool_start) * 1000)
            self._tool_calls.append({
                "name": self._current_tool_name,
                "duration_ms": duration_ms,
                "success": False,
                "output_len": 0,
            })
        self._current_tool_start = None
        self._current_tool_name = None

    def on_chain_end(self, outputs, **kwargs):
        self._write_run(error=None)

    def on_chain_error(self, error, **kwargs):
        self._write_run(error=str(error))

    def _write_run(self, error: Optional[str]):
        if not self._started_at:
            return
        ended_at = int(time.time() * 1000)
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute(
                """INSERT OR REPLACE INTO agent_runs
                   (id, agent_name, started_at, ended_at, duration_ms,
                    llm_calls, tool_calls, total_tokens, prompt_tokens,
                    completion_tokens, error, langsmith_run_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    self._run_id, self.agent_name, self._started_at, ended_at,
                    ended_at - self._started_at, self._llm_calls,
                    json.dumps(self._tool_calls), self._total_tokens,
                    self._prompt_tokens, self._completion_tokens, error,
                    self._langsmith_run_id,
                )
            )
            conn.commit()
        finally:
            conn.close()
