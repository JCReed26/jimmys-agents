import pytest
import sqlite3
import asyncio
from db import get_agent_stats, get_recent_runs

@pytest.fixture
def db_with_data(tmp_path):
    """Seed a test SQLite db with 3 runs for gmail-agent."""
    db_path = str(tmp_path / "metrics.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE agent_runs (
            id TEXT PRIMARY KEY, agent_name TEXT, started_at INTEGER,
            ended_at INTEGER, duration_ms INTEGER, llm_calls INTEGER,
            tool_calls TEXT, total_tokens INTEGER, prompt_tokens INTEGER,
            completion_tokens INTEGER, error TEXT, langsmith_run_id TEXT
        )
    """)
    runs = [
        ("r1", "gmail-agent", 1000, 2000, 1000, 2, '[{"name":"search","duration_ms":100}]', 500, 300, 200, None, None),
        ("r2", "gmail-agent", 3000, 4500, 1500, 3, '[{"name":"search","duration_ms":200}]', 700, 400, 300, None, None),
        ("r3", "gmail-agent", 5000, 5200, 200, 1, '[]', 100, 80, 20, "timeout", None),
    ]
    conn.executemany("INSERT INTO agent_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", runs)
    conn.commit()
    conn.close()
    return db_path

def test_get_agent_stats_calculates_correctly(db_with_data):
    stats = asyncio.run(get_agent_stats("gmail-agent", db_path=db_with_data))
    assert stats["total_runs"] == 3
    assert stats["success_rate"] == pytest.approx(66.7, rel=0.01)
    assert stats["avg_duration_ms"] == pytest.approx(900.0)
    assert stats["top_tools"][0]["name"] == "search"

def test_get_recent_runs_returns_last_20(db_with_data):
    runs = asyncio.run(get_recent_runs("gmail-agent", db_path=db_with_data))
    assert len(runs) == 3
    assert runs[0]["id"] == "r3"  # most recent first
