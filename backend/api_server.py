"""
jimmys-agents API Gateway (port 8080)

AG-UI compliant gateway for LangGraph agent processes.
- Agent registry driven by agents.yaml (hot-reload via POST /registry/reload)
- Strict AG-UI: POST /agents/{name}/run → SSE stream response
- Per-agent rate limiting via slowapi
- Circuit breaker: 3 failures → OPEN for 60s → 503 fast-fail
- No WebSocket, no custom SSE pub-sub, no translation layer
"""
from __future__ import annotations

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend import db
from backend.agent_registry import registry
from backend.translator import StreamTranslator

PROJECT_ROOT = Path(__file__).parent.parent

# ─────────────────────────────────────────
# Rate limiter
# ─────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

# ─────────────────────────────────────────
# Scheduler
# ─────────────────────────────────────────

scheduler = AsyncIOScheduler()


async def trigger_agent_run(agent: str, workflow: str = "default", task_prompt: str | None = None):
    """
    Fire a LangGraph /runs/stream call for scheduled runs.
    Translates to AG-UI, publishes to live queue, writes HOTL on completion.
    """
    run_id = str(uuid.uuid4())
    db.run_start(agent, run_id)

    agent_cfg = registry.get(agent)
    if not agent_cfg or not agent_cfg.enabled:
        db.run_finish(run_id, "error", error_msg="Agent not registered or disabled")
        return

    # Get or create a stable thread_id for this schedule
    sched = db.schedule_get(agent, workflow)
    thread_id = (sched.get("thread_id") if sched else None) or f"thread-schedule-{agent}-{workflow}"
    if sched and not sched.get("thread_id"):
        db.schedule_set_thread_id(agent, workflow, thread_id)

    prompt = task_prompt or "Run your scheduled task."
    lg_payload = {
        "assistant_id": "agent",
        "input": {"messages": [{"role": "user", "content": prompt}]},
        "config": {"configurable": {"thread_id": thread_id}},
        "stream_mode": ["messages"],
    }

    translator = StreamTranslator(run_id=run_id, thread_id=thread_id)
    _publish_live(agent, translator.start())

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{registry.base_url(agent)}/runs/stream",
                json=lg_payload,
                headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            ) as resp:
                resp.raise_for_status()

                current_event_type = "messages/partial"
                async for line in resp.aiter_lines():
                    if line.startswith("event: "):
                        current_event_type = line[7:].strip()
                    elif line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        for ag_ui_line in translator.feed(current_event_type, data):
                            _publish_live(agent, ag_ui_line)

        for ag_ui_line in translator.finish():
            _publish_live(agent, ag_ui_line)

        usage = translator.usage_metadata or {}
        token_count = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        cost_usd = _estimate_cost(token_count)
        db.run_finish(run_id, "done", token_count=token_count, cost_usd=cost_usd)
        db.hotl_create(agent, run_id, translator.hotl_summary)

    except Exception as e:
        db.run_finish(run_id, "error", error_msg=str(e))
        _publish_live(agent, translator.error(str(e)))


def _reload_schedules():
    """Sync APScheduler with the schedules_v2 table."""
    for row in db.schedule_list():
        job_id = f"agent_{row['agent']}_{row['workflow']}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        if row["enabled"]:
            try:
                trigger = CronTrigger.from_crontab(row["cron_expr"])
                scheduler.add_job(
                    trigger_agent_run,
                    trigger=trigger,
                    id=job_id,
                    kwargs={
                        "agent": row["agent"],
                        "workflow": row["workflow"],
                        "task_prompt": row.get("task_prompt"),
                    },
                    replace_existing=True,
                )
            except Exception:
                pass  # invalid cron — skip silently


@asynccontextmanager
async def lifespan(app: FastAPI):
    _reload_schedules()
    scheduler.start()
    yield
    scheduler.shutdown()


# ─────────────────────────────────────────
# App
# ─────────────────────────────────────────

app = FastAPI(title="jimmys-agents API Gateway", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────
# Health
# ─────────────────────────────────────────

@app.get("/ok")
def health():
    return {"ok": True}


# ─────────────────────────────────────────
# Nav counts (for sidebar badges)
# ─────────────────────────────────────────

@app.get("/nav-counts")
def nav_counts():
    pending = len(db.hitl_list(status="pending"))
    unread = len(db.hotl_list(unread_only=True))
    return {"hitl": pending, "hotlUnread": unread}


# ─────────────────────────────────────────
# Agent registry + status
# ─────────────────────────────────────────

@app.post("/registry/reload")
def reload_registry():
    """Hot-reload agents.yaml without restarting the server."""
    registry.reload()
    _reload_schedules()
    return {
        "ok": True,
        "agents": [a.name for a in registry.get_all()],
    }


@app.get("/agents")
async def agents_status():
    """List all registered agents with live health + circuit breaker status."""
    results: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=2) as client:
        for agent in registry.get_all():
            entry: dict[str, Any] = {
                "enabled": agent.enabled,
                "port": agent.port,
                "circuit": registry.circuit_status(agent.name),
            }
            if agent.enabled:
                try:
                    r = await client.get(f"{registry.base_url(agent.name)}/assistants")
                    entry["status"] = "RUNNING" if r.status_code == 200 else "DOWN"
                except Exception:
                    entry["status"] = "DOWN"
            else:
                entry["status"] = "DISABLED"
            results[agent.name] = entry

    # Enrich with schedule info
    for sched in db.schedule_list():
        name = sched["agent"]
        if name in results:
            results[name].setdefault("schedules", []).append({
                "workflow": sched["workflow"],
                "cron": sched["cron_expr"],
                "enabled": bool(sched["enabled"]),
                "lastRun": sched.get("last_run"),
                "nextRun": sched.get("next_run"),
            })

    # Enrich with pending HITL count
    for item in db.hitl_list(status="pending"):
        name = item["agent"]
        if name in results:
            results[name]["hitlCount"] = results[name].get("hitlCount", 0) + 1

    return results


# ─────────────────────────────────────────
# AG-UI run endpoint (POST → SSE stream)
# ─────────────────────────────────────────

async def _proxy_sse(agent_name: str, request: Request) -> AsyncIterator[str]:
    """
    Call {agent_url}/runs/stream (LangGraph native SSE),
    translate to AG-UI events, stream to browser.
    Writes run_record and HOTL on completion.
    """
    run_id = str(uuid.uuid4())
    db.run_start(agent_name, run_id)

    # Parse AG-UI request body
    try:
        body_bytes = await request.body()
        req_data = json.loads(body_bytes) if body_bytes else {}
    except Exception:
        req_data = {}

    thread_id = req_data.get("thread_id") or str(uuid.uuid4())
    messages = req_data.get("messages", [])

    # Build LangGraph payload
    lg_payload = {
        "assistant_id": "agent",
        "input": {"messages": messages},
        "config": {"configurable": {"thread_id": thread_id}},
        "stream_mode": ["messages"],
    }

    translator = StreamTranslator(run_id=run_id, thread_id=thread_id)
    yield translator.start()

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{registry.base_url(agent_name)}/runs/stream",
                json=lg_payload,
                headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            ) as resp:
                resp.raise_for_status()
                registry.record_success(agent_name)

                current_event_type = "messages/partial"
                async for line in resp.aiter_lines():
                    if await request.is_disconnected():
                        break
                    if line.startswith("event: "):
                        current_event_type = line[7:].strip()
                    elif line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        for ag_ui_line in translator.feed(current_event_type, data):
                            yield ag_ui_line

        for ag_ui_line in translator.finish():
            yield ag_ui_line

        usage = translator.usage_metadata or {}
        token_count = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        cost_usd = _estimate_cost(token_count)
        db.run_finish(run_id, "done", token_count=token_count, cost_usd=cost_usd)
        db.hotl_create(agent_name, run_id, translator.hotl_summary)

    except httpx.HTTPStatusError as e:
        registry.record_failure(agent_name)
        db.run_finish(run_id, "error", error_msg=str(e))
        yield translator.error(f"Agent returned HTTP {e.response.status_code}")

    except Exception as e:
        registry.record_failure(agent_name)
        db.run_finish(run_id, "error", error_msg=str(e))
        yield translator.error(str(e))


@app.post("/agents/{name}/run")
async def agent_run(name: str, request: Request):
    """
    AG-UI compliant endpoint. POST body is forwarded to the agent's /run,
    SSE response is streamed back verbatim.
    """
    agent = registry.get(name)
    if not agent:
        raise HTTPException(404, f"Agent '{name}' not registered. Add it to agents.yaml and POST /registry/reload.")
    if not agent.enabled:
        raise HTTPException(404, f"Agent '{name}' is disabled.")
    if registry.is_circuit_open(name):
        raise HTTPException(503, f"Agent '{name}' circuit breaker is OPEN — too many recent failures. Retry later.")

    # Per-agent rate limit from agents.yaml (evaluated dynamically)
    # slowapi's decorator API doesn't support dynamic limits, so we apply it manually.
    limit_str = agent.rate_limit  # e.g. "10/minute"
    await _check_rate_limit(name, limit_str, request)

    return StreamingResponse(
        _proxy_sse(name, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Agent": name,
        },
    )


@app.get("/sse/{agent}/live")
async def sse_live(agent: str):
    """
    Subscribe to AG-UI events from the currently-running scheduled task.
    Stays open, sends heartbeat comments every 15s to keep connection alive.
    """
    q = _get_live_queue(agent)

    async def event_stream():
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=15.0)
                yield event
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/chat/{agent}/history")
async def chat_history(agent: str, thread_id: str):
    """
    Proxy to LangGraph thread state. Returns messages for session restore.
    Returns {"messages": []} if agent is down or thread not found.
    """
    agent_cfg = registry.get(agent)
    if not agent_cfg or not agent_cfg.enabled:
        return {"messages": []}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"{registry.base_url(agent)}/threads/{thread_id}/state"
            )
            r.raise_for_status()
            state = r.json()
            # LangGraph thread state: {"values": {"messages": [...]}, ...}
            messages_raw = state.get("values", {}).get("messages", [])
            messages = [
                {"role": "assistant" if m.get("type") == "ai" else "human",
                 "content": m.get("content", "")}
                for m in messages_raw
                if m.get("type") in ("human", "ai")
            ]
            return {"messages": messages}
    except Exception:
        return {"messages": []}


# Per-agent in-memory rate limit buckets: {agent: {ip: [timestamps]}}
_rate_buckets: dict[str, dict[str, list[float]]] = {}

# In-memory pub-sub for scheduled run live stream: {agent_name: asyncio.Queue}
_live_queues: dict[str, asyncio.Queue] = {}


def _get_live_queue(agent: str) -> asyncio.Queue:
    if agent not in _live_queues:
        _live_queues[agent] = asyncio.Queue(maxsize=500)
    return _live_queues[agent]


def _publish_live(agent: str, event_line: str) -> None:
    """Non-blocking put to live queue. Silently drops if full."""
    q = _get_live_queue(agent)
    try:
        q.put_nowait(event_line)
    except asyncio.QueueFull:
        pass


def _estimate_cost(total_tokens: int) -> float:
    """Rough Gemini 2.5 Flash cost estimate (~$0.50/1M tokens average)."""
    return round(total_tokens * 0.0000005, 6)


async def _check_rate_limit(agent_name: str, limit_str: str, request: Request):
    """
    Simple sliding-window rate limiter.
    limit_str format: "{count}/{unit}" — unit: second|minute|hour
    """
    import time

    count_str, unit = limit_str.split("/")
    max_calls = int(count_str)
    window_secs = {"second": 1, "minute": 60, "hour": 3600}.get(unit, 60)

    client_ip = get_remote_address(request)
    now = time.monotonic()

    buckets = _rate_buckets.setdefault(agent_name, {})
    timestamps = buckets.setdefault(client_ip, [])

    # Evict timestamps outside the window
    buckets[client_ip] = [t for t in timestamps if now - t < window_secs]

    if len(buckets[client_ip]) >= max_calls:
        raise HTTPException(
            429,
            detail=f"Rate limit exceeded for agent '{agent_name}': {limit_str}. Slow down.",
            headers={"Retry-After": str(window_secs)},
        )

    buckets[client_ip].append(now)


# ─────────────────────────────────────────
# HITL
# ─────────────────────────────────────────

class HitlCreateRequest(BaseModel):
    agent: str
    item_type: str
    payload: dict[str, Any]


class HitlResolveRequest(BaseModel):
    decision: str   # approved | rejected
    comment: str = ""


@app.get("/hitl")
def list_hitl(status: str | None = None, agent: str | None = None):
    return db.hitl_list(status=status, agent=agent)


@app.post("/hitl")
def create_hitl(req: HitlCreateRequest):
    item_id = db.hitl_create(req.agent, req.item_type, req.payload)
    return {"id": item_id}


@app.get("/hitl/{item_id}")
def get_hitl(item_id: int):
    item = db.hitl_get(item_id)
    if not item:
        raise HTTPException(404, "Not found")
    return item


@app.post("/hitl/{item_id}/resolve")
def resolve_hitl(item_id: int, req: HitlResolveRequest):
    ok = db.hitl_resolve(item_id, req.decision, req.comment)
    if not ok:
        raise HTTPException(404, "Item not found or already resolved")
    return {"ok": True}


# ─────────────────────────────────────────
# HOTL
# ─────────────────────────────────────────

class HotlCreateRequest(BaseModel):
    agent: str
    run_id: str
    summary: dict[str, Any]


@app.get("/hotl")
def list_hotl(agent: str | None = None, unread_only: bool = False):
    return db.hotl_list(agent=agent, unread_only=unread_only)


@app.post("/hotl")
def create_hotl(req: HotlCreateRequest):
    log_id = db.hotl_create(req.agent, req.run_id, req.summary)
    return {"id": log_id}


@app.post("/hotl/clear")
def clear_hotl(agent: str | None = None):
    """Permanently delete HOTL logs. Destructive — confirm in UI before calling."""
    deleted = db.hotl_clear(agent=agent)
    return {"ok": True, "deleted": deleted}


@app.post("/hotl/{log_id}/read")
def mark_hotl_read(log_id: int):
    db.hotl_mark_read(log_id=log_id)
    return {"ok": True}


@app.post("/hotl/read-all")
def mark_all_hotl_read(agent: str | None = None):
    db.hotl_mark_read(agent=agent)
    return {"ok": True}


# ─────────────────────────────────────────
# Run records
# ─────────────────────────────────────────

@app.get("/runs")
def list_runs(agent: str | None = None, limit: int = 50):
    return db.run_list(agent=agent, limit=limit)


@app.post("/runs/start")
def start_run(agent: str, run_id: str):
    db.run_start(agent, run_id)
    return {"ok": True}


class RunFinishRequest(BaseModel):
    status: str
    token_count: int = 0
    cost_usd: float = 0.0
    error_msg: str | None = None


@app.post("/runs/{run_id}/finish")
def finish_run(run_id: str, req: RunFinishRequest):
    db.run_finish(run_id, req.status, req.token_count, req.cost_usd, req.error_msg)
    return {"ok": True}


# ─────────────────────────────────────────
# Schedules
# ─────────────────────────────────────────

class ScheduleUpsertRequest(BaseModel):
    agent: str
    workflow: str = "default"
    cron_expr: str
    enabled: bool = True
    task_prompt: str = ""


@app.get("/schedules")
def list_schedules():
    return db.schedule_list()


@app.post("/schedules")
def upsert_schedule(req: ScheduleUpsertRequest):
    db.schedule_upsert(req.agent, req.cron_expr, req.enabled, req.task_prompt, req.workflow)
    _reload_schedules()
    return {"ok": True}


@app.post("/schedules/{agent}/trigger")
async def manual_trigger(agent: str, workflow: str = "default"):
    """Manually fire an agent workflow outside its schedule."""
    sched = db.schedule_get(agent, workflow)
    prompt = sched["task_prompt"] if sched else None
    asyncio.create_task(trigger_agent_run(agent, workflow, prompt))
    return {"ok": True, "message": f"Triggered {agent}/{workflow}"}


# ─────────────────────────────────────────
# Memory / Rules (file-based — Deep Agents owns these)
# ─────────────────────────────────────────

def _read_agent_file(name: str, filename: str) -> str:
    agent = registry.get(name)
    if not agent:
        return f"# {filename}\n\n_(Agent '{name}' not registered.)_\n"
    # Memory: check skills/AGENTS.md first (deepagent convention), fall back to MEMORY.md
    if filename == "MEMORY.md":
        for candidate in (
            PROJECT_ROOT / agent.dir / "skills" / "AGENTS.md",
            PROJECT_ROOT / agent.dir / "MEMORY.md",
        ):
            if candidate.exists():
                return candidate.read_text()
        return "# Memory\n\n_(No content yet — written by the agent during runs.)_\n"
    path = PROJECT_ROOT / agent.dir / filename
    if path.exists():
        return path.read_text()
    return f"# {filename}\n\n_(No content yet — this file is managed by the agent.)_\n"


@app.get("/agents/{name}/memory")
def get_memory(name: str):
    if not registry.is_registered(name):
        raise HTTPException(404, f"Agent '{name}' not registered.")
    return {"content": _read_agent_file(name, "MEMORY.md")}


@app.get("/agents/{name}/rules")
def get_rules(name: str):
    if not registry.is_registered(name):
        raise HTTPException(404, f"Agent '{name}' not registered.")
    return {"content": _read_agent_file(name, "RULES.md")}


# ─────────────────────────────────────────
# Stats
# ─────────────────────────────────────────

@app.get("/stats")
def get_stats():
    runs = db.run_list(limit=1000)
    by_agent: dict[str, dict] = {}
    for r in runs:
        a = r["agent"]
        if a not in by_agent:
            by_agent[a] = {"total_runs": 0, "errors": 0, "total_tokens": 0, "total_cost": 0.0}
        by_agent[a]["total_runs"] += 1
        if r["status"] == "error":
            by_agent[a]["errors"] += 1
        by_agent[a]["total_tokens"] += r.get("token_count") or 0
        by_agent[a]["total_cost"] += r.get("cost_usd") or 0.0
    return {"by_agent": by_agent, "total_runs": len(runs)}


# ─────────────────────────────────────────
# Search
# ─────────────────────────────────────────

@app.get("/search")
def global_search(q: str):
    if not q or len(q) < 2:
        return {"results": []}
    q_lower = q.lower()
    results: list[dict] = []

    for log in db.hotl_list():
        s = log["summary"]
        if q_lower in json.dumps(s).lower():
            results.append({
                "type": "hotl",
                "agent": log["agent"],
                "id": log["id"],
                "excerpt": s.get("overview", "")[:120],
                "created_at": log["created_at"],
            })

    for item in db.hitl_list():
        text = (str(item.get("payload", "")) + " " + (item.get("comment") or "")).lower()
        if q_lower in text:
            results.append({
                "type": "hitl",
                "agent": item["agent"],
                "id": item["id"],
                "excerpt": str(item.get("payload", ""))[:120],
                "created_at": item["created_at"],
            })

    for agent in registry.get_all():
        agent_dir = PROJECT_ROOT / agent.dir
        candidates = [
            (agent_dir / "skills" / "AGENTS.md", "memory"),
            (agent_dir / "MEMORY.md", "memory"),
            (agent_dir / "RULES.md", "rules"),
        ]
        seen_types: set[str] = set()
        for fpath, ftype in candidates:
            if ftype in seen_types:
                continue  # already matched a memory file for this agent
            if fpath.exists():
                content = fpath.read_text()
                if q_lower in content.lower():
                    idx = content.lower().index(q_lower)
                    start = max(0, idx - 60)
                    excerpt = content[start : idx + 60].strip()
                    results.append({
                        "type": ftype,
                        "agent": agent.name,
                        "id": fpath.name,
                        "excerpt": excerpt,
                        "created_at": None,
                    })
                    seen_types.add(ftype)

    return {"results": results[:50]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
