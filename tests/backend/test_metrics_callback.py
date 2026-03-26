import json
import sqlite3
import time
import pytest
from unittest.mock import MagicMock
from backend.metrics_callback import MetricsCallback, init_db

@pytest.fixture
def db_path(tmp_path):
    path = str(tmp_path / "test_metrics.db")
    init_db(path)
    return path

def test_init_db_creates_table(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_runs'")
    assert cursor.fetchone() is not None
    conn.close()

def test_run_recorded_on_chain_end(db_path):
    cb = MetricsCallback(agent_name="test-agent", db_path=db_path)
    cb.on_chain_start({}, {})
    cb.on_llm_end(MagicMock(llm_output={"token_usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30}}))
    cb.on_chain_end({})

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT agent_name, total_tokens, error FROM agent_runs").fetchone()
    conn.close()

    assert row[0] == "test-agent"
    assert row[1] == 30
    assert row[2] is None

def test_error_recorded_on_chain_error(db_path):
    cb = MetricsCallback(agent_name="test-agent", db_path=db_path)
    cb.on_chain_start({}, {})
    cb.on_chain_error(ValueError("something broke"))

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT error FROM agent_runs").fetchone()
    conn.close()

    assert "something broke" in row[0]

def test_tool_calls_recorded(db_path):
    cb = MetricsCallback(agent_name="test-agent", db_path=db_path)
    cb.on_chain_start({}, {})
    cb.on_tool_start({"name": "search_gmail"}, "input")
    time.sleep(0.01)
    cb.on_tool_end("output")
    cb.on_chain_end({})

    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT tool_calls FROM agent_runs").fetchone()
    conn.close()

    tool_calls = json.loads(row[0])
    assert len(tool_calls) == 1
    assert tool_calls[0]["name"] == "search_gmail"
    assert tool_calls[0]["duration_ms"] > 0
