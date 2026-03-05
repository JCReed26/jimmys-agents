import json
import os
import aiosqlite
from collections import Counter

DB_PATH = os.environ.get("METRICS_DB_PATH", "/app/data/metrics.db")


async def get_agent_stats(agent_name: str, db_path: str = DB_PATH) -> dict:
    """Return aggregated stats for one agent."""
    if not os.path.exists(db_path):
        return {"total_runs": 0, "success_rate": 0, "avg_duration_ms": 0, "top_tools": []}
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            "SELECT duration_ms, error, tool_calls FROM agent_runs WHERE agent_name = ?",
            (agent_name,)
        ) as cursor:
            rows = await cursor.fetchall()

    if not rows:
        return {"total_runs": 0, "success_rate": 0, "avg_duration_ms": 0, "top_tools": []}

    total = len(rows)
    successes = sum(1 for r in rows if r["error"] is None)
    durations = [r["duration_ms"] for r in rows if r["duration_ms"] is not None]
    avg_duration = sum(durations) / len(durations) if durations else 0

    tool_counter: Counter = Counter()
    for row in rows:
        calls = json.loads(row["tool_calls"] or "[]")
        for call in calls:
            tool_counter[call["name"]] += 1

    top_tools = [{"name": k, "count": v} for k, v in tool_counter.most_common(5)]

    return {
        "total_runs": total,
        "success_rate": round((successes / total) * 100, 1),
        "avg_duration_ms": round(avg_duration, 1),
        "top_tools": top_tools,
    }


async def get_recent_runs(agent_name: str, limit: int = 20, db_path: str = DB_PATH) -> list[dict]:
    """Return last N runs for an agent, most recent first."""
    if not os.path.exists(db_path):
        return []
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute(
            """SELECT id, started_at, duration_ms, llm_calls, total_tokens,
                      error, langsmith_run_id, tool_calls
               FROM agent_runs WHERE agent_name = ?
               ORDER BY started_at DESC LIMIT ?""",
            (agent_name, limit)
        ) as cursor:
            rows = await cursor.fetchall()
    return [dict(r) for r in rows]
