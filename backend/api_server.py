"""
jimmys-agents API Gateway (port 8080)

AG-UI compliant gateway for LangGraph agent processes.
- Agent registry driven by agents.yaml (hot-reload via POST /registry/reload)
- Strict AG-UI: POST /agents/{name}/run → SSE stream response
- Per-agent rate limiting via slowapi
- Circuit breaker: 3 failures → OPEN for 60s → 503 fast-fail
- JWT auth via Supabase — tenant_id extracted from token, all queries tenant-scoped
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator, Optional

import asyncpg
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

from backend import db_postgres as db
from backend.agent_registry import registry
from backend.auth_middleware import auth_middleware, validate_env
from backend.translator import StreamTranslator

PROJECT_ROOT = Path(__file__).parent.parent

# ─────────────────────────────────────────
# Rate limiter
# ─────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

# ─────────────────────────────────────────
# Scheduler + pool (module-level for background tasks)
# ─────────────────────────────────────────

scheduler = AsyncIOScheduler()
_pool: asyncpg.Pool | None = None


async def trigger_agent_run(
    tenant_id: str,
    agent: str,
    workflow: str = "default",
    task_prompt: str | None = None,
    thread_id: str | None = None,
):
    """
    Fire a LangGraph /runs/stream call for scheduled runs.
    Translates to AG-UI, publishes to live queue, writes HOTL on completion.
    """
    global _pool
    run_id = str(uuid.uuid4())

    async with _pool.acquire() as conn:
        await db.start_run(conn, tenant_id, agent, run_id)

    agent_cfg = registry.get(agent)
    if not agent_cfg or not agent_cfg.enabled:
        async with _pool.acquire() as conn:
            await db.finish_run(conn, tenant_id, run_id, "error", error_msg="Agent not registered or disabled")
        return

    if thread_id is None:
        thread_id = db.make_thread_id(tenant_id, agent)

    prompt = task_prompt or "Run your scheduled task."
    lg_payload = {
        "assistant_id": "agent",
        "input": {"messages": [{"role": "user", "content": prompt}]},
        "config": {"configurable": {"thread_id": thread_id}},
        "stream_mode": ["messages"],
    }

    translator = StreamTranslator(run_id=run_id, thread_id=thread_id)
    _publish_live(tenant_id, agent, translator.start())

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
                            _publish_live(tenant_id, agent, ag_ui_line)

        for ag_ui_line in translator.finish():
            _publish_live(tenant_id, agent, ag_ui_line)

        usage = translator.usage_metadata or {}
        token_count = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        cost_usd = _estimate_cost(token_count)
        async with _pool.acquire() as conn:
            await db.finish_run(conn, tenant_id, run_id, "done", token_count=token_count, cost_usd=cost_usd)
            await db.create_hotl_log(conn, tenant_id, agent, run_id, translator.hotl_summary)

    except Exception as e:
        async with _pool.acquire() as conn:
            await db.finish_run(conn, tenant_id, run_id, "error", error_msg=str(e))
        _publish_live(tenant_id, agent, translator.error(str(e)))


async def _reload_schedules():
    """Sync APScheduler with the schedules table (all tenants)."""
    global _pool
    if _pool is None:
        return

    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT tenant_id::text, agent, workflow, cron_expr, enabled, task_prompt, thread_id::text FROM schedules"
        )

    # M-07: one connection for the whole batch of UPDATE writes
    async with _pool.acquire() as conn:
        for row in rows:
            job_id = f"agent_{row['tenant_id']}_{row['agent']}_{row['workflow']}"
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
                            "tenant_id": row["tenant_id"],
                            "agent": row["agent"],
                            "workflow": row["workflow"],
                            "task_prompt": row.get("task_prompt"),
                            "thread_id": row.get("thread_id"),
                        },
                        replace_existing=True,
                    )
                except Exception:
                    pass  # invalid cron — skip silently

            # Reflect the enabled state back to DB so the toggle is consistent
            await conn.execute(
                """
                UPDATE schedules SET enabled=$1
                WHERE tenant_id=$2 AND agent=$3 AND workflow=$4
                """,
                row["enabled"], row["tenant_id"], row["agent"], row["workflow"],
            )


async def _init_conn(conn):
    """Register JSON/JSONB codecs so asyncpg returns Python dicts."""
    await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")
    await conn.set_type_codec("json", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    validate_env()
    _pool = await asyncpg.create_pool(
        os.environ["DATABASE_URL"],
        min_size=2,
        max_size=10,
        init=_init_conn,
        max_inactive_connection_lifetime=300,
    )
    app.state.pool = _pool
    await _reload_schedules()
    scheduler.start()
    yield
    scheduler.shutdown()
    await _pool.close()


# ─────────────────────────────────────────
# App
# ─────────────────────────────────────────

app = FastAPI(title="jimmys-agents API Gateway", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

_cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _auth(request: Request, call_next):
    # Pass OPTIONS through so CORS preflight isn't blocked by auth
    if request.method == "OPTIONS":
        return await call_next(request)
    return await auth_middleware(request, call_next)

@app.get("/ok")
async def health_check(request: Request):
    """Health check endpoint, verifies DB connection."""
    try:
        if request.app.state.pool:
            async with request.app.state.pool.acquire() as conn:
                await conn.execute("SELECT 1")
            return {"status": "ok", "db": "ok"}
        return {"status": "degraded", "db": "not_initialized"}
    except Exception as e:
        return {"status": "degraded", "db": "error", "message": str(e)}

# ─────────────────────────────────────────
# Health
# ─────────────────────────────────────────

@app.get("/ok")
def health():
    return {"ok": True}


# ─────────────────────────────────────────
# Me
# ─────────────────────────────────────────

@app.get("/me")
async def get_me(request: Request):
    async with request.app.state.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT name FROM tenants WHERE id=$1", request.state.tenant_id
        )
    return {
        "tenant_id": request.state.tenant_id,
        "user_id": request.state.user_id,
        "tenant_name": row["name"] if row else "Unknown",
    }


# ─────────────────────────────────────────
# Nav counts (for sidebar badges)
# ─────────────────────────────────────────

@app.get("/nav-counts")
async def nav_counts(request: Request):
    async with request.app.state.pool.acquire() as conn:
        return await db.get_nav_counts(conn, request.state.tenant_id)


# ─────────────────────────────────────────
# Agent registry + status
# ─────────────────────────────────────────

@app.post("/registry/reload")
async def reload_registry(request: Request):
    """Hot-reload agents.yaml without restarting the server."""
    registry.reload()
    await _reload_schedules()
    return {
        "ok": True,
        "agents": [a.name for a in registry.get_all()],
    }


@app.get("/agents")
async def agents_status(request: Request):
    """List tenant's provisioned agents with live health + circuit breaker status."""
    tenant_id = request.state.tenant_id

    async with request.app.state.pool.acquire() as conn:
        tenant_agents = await db.list_tenant_agents(conn, tenant_id)
        schedules = await db.list_schedules(conn, tenant_id)
        hitl_pending = await db.list_hitl_items(conn, tenant_id, status="pending")
        runs = await conn.fetch("SELECT id, agent, status, started_at, cost_usd, token_count, error_msg FROM run_records WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 100", tenant_id)

    results: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=2) as client:
        for agent in tenant_agents:
            entry: dict[str, Any] = {
                "enabled": agent["status"] == "active",
                "port": agent["port"],
                "accentColor": agent["accent_color"],
                "displayName": agent["display_name"],
                "circuit": registry.circuit_status(agent["name"]),
            }
            try:
                r = await client.get(f"http://localhost:{agent['port']}/assistants")
                entry["status"] = "RUNNING" if r.status_code == 200 else "DOWN"
            except Exception:
                entry["status"] = "DOWN"
            results[agent["name"]] = entry

    for sched in schedules:
        name = sched["agent"]
        if name in results:
            results[name].setdefault("schedules", []).append({
                "workflow": sched["workflow"],
                "cron": sched["cron_expr"],
                "enabled": bool(sched["enabled"]),
                "lastRun": str(sched["last_run"]) if sched.get("last_run") else None,
                "nextRun": str(sched["next_run"]) if sched.get("next_run") else None,
            })

    for item in hitl_pending:
        name = item["agent"]
        if name in results:
            results[name]["hitlCount"] = results[name].get("hitlCount", 0) + 1

    # Add run statistics
    for run in runs:
        name = run["agent"]
        if name in results:
            results[name]["totalRuns"] = results[name].get("totalRuns", 0) + 1
            if run["status"] == "error":
                results[name]["errorRuns"] = results[name].get("errorRuns", 0) + 1
                
            # Keep the most recent run as lastRun
            if "lastRun" not in results[name] or str(run["started_at"]) > results[name]["lastRun"]:
                results[name]["lastRun"] = str(run["started_at"])
                results[name]["lastRunStatus"] = run["status"]
                if run["status"] == "error":
                    results[name]["lastError"] = run["error_msg"]

    return results


# ─────────────────────────────────────────
# AG-UI run endpoint (POST → SSE stream)
# ─────────────────────────────────────────

async def _proxy_sse(agent_name: str, tenant_id: str, request: Request) -> AsyncIterator[str]:
    """
    Call {agent_url}/runs/stream (LangGraph native SSE),
    translate to AG-UI events, stream to browser.
    Writes run_record and HOTL on completion.
    """
    run_id = str(uuid.uuid4())
    pool = request.app.state.pool

    async with pool.acquire() as conn:
        await db.start_run(conn, tenant_id, agent_name, run_id)

    try:
        body_bytes = await request.body()
        req_data = json.loads(body_bytes) if body_bytes else {}
    except Exception:
        req_data = {}

    thread_id = req_data.get("thread_id") or db.make_thread_id(tenant_id, agent_name)
    messages = req_data.get("messages", [])

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
        async with pool.acquire() as conn:
            await db.finish_run(conn, tenant_id, run_id, "done", token_count=token_count, cost_usd=cost_usd)
            await db.create_hotl_log(conn, tenant_id, agent_name, run_id, translator.hotl_summary)

    except httpx.HTTPStatusError as e:
        registry.record_failure(agent_name)
        async with pool.acquire() as conn:
            await db.finish_run(conn, tenant_id, run_id, "error", error_msg=str(e))
        yield translator.error(f"Agent returned HTTP {e.response.status_code}")

    except Exception as e:
        registry.record_failure(agent_name)
        async with pool.acquire() as conn:
            await db.finish_run(conn, tenant_id, run_id, "error", error_msg=str(e))
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

    limit_str = agent.rate_limit
    await _check_rate_limit(name, limit_str, request)

    return StreamingResponse(
        _proxy_sse(name, request.state.tenant_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "X-Agent": name,
        },
    )


@app.get("/sse/{agent}/live")
async def sse_live(agent: str, request: Request):
    """
    Subscribe to AG-UI events from the currently-running scheduled task.
    Stays open, sends heartbeat comments every 15s to keep connection alive.
    Scoped to requesting tenant — cannot receive another tenant's run events.
    """
    q = _get_live_queue(request.state.tenant_id, agent)

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
async def chat_history(agent: str, thread_id: str, request: Request):
    """
    Proxy to LangGraph thread state. Returns messages for session restore.
    Validates thread_id belongs to requesting tenant before proxying.
    Returns {"messages": []} if agent is down, thread not found, or tenant mismatch.
    """
    tenant_id = request.state.tenant_id
    if not thread_id.startswith(f"thread-{tenant_id}-"):
        return {"messages": []}

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


def _get_live_queue(tenant_id: str, agent: str) -> asyncio.Queue:
    key = f"{tenant_id}:{agent}"
    if key not in _live_queues:
        _live_queues[key] = asyncio.Queue(maxsize=500)
    return _live_queues[key]


def _publish_live(tenant_id: str, agent: str, event_line: str) -> None:
    """Non-blocking put to tenant-scoped live queue. Silently drops if full."""
    q = _get_live_queue(tenant_id, agent)
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
async def list_hitl(request: Request, status: str | None = None, agent: str | None = None):
    async with request.app.state.pool.acquire() as conn:
        return await db.list_hitl_items(conn, request.state.tenant_id, status=status, agent=agent)


@app.post("/hitl")
async def create_hitl(req: HitlCreateRequest, request: Request):
    async with request.app.state.pool.acquire() as conn:
        item = await db.create_hitl_item(conn, request.state.tenant_id, req.agent, req.item_type, req.payload)
    return {"id": str(item["id"])}


@app.get("/hitl/{item_id}")
async def get_hitl(item_id: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        item = await db.get_hitl_item(conn, request.state.tenant_id, item_id)
    if not item:
        raise HTTPException(404, "Not found")
    return item


@app.post("/hitl/{item_id}/resolve")
async def resolve_hitl(item_id: str, req: HitlResolveRequest, request: Request):
    async with request.app.state.pool.acquire() as conn:
        result = await db.resolve_hitl_item(conn, request.state.tenant_id, item_id, req.decision, req.comment)
    if not result:
        raise HTTPException(404, "Item not found or already resolved")
    return {"ok": True}


# ─────────────────────────────────────────
# HOTL
# ─────────────────────────────────────────

JAMES_TENANT_ID = "4efdeb00-1b23-4031-bc77-555af005a406"


class HotlCreateRequest(BaseModel):
    # agent_name is the canonical field agents send; agent is accepted as an alias
    agent_name: str | None = None
    agent: str | None = None
    run_id: str = ""
    # Flat fields agents send from aafter_agent
    overview: str | None = None
    tools: list[Any] | None = None
    thoughts: str | None = None
    # Optional cost/token/trace metadata
    cost_usd: float | None = None
    total_tokens: int | None = None
    langsmith_run_id: str | None = None
    # Legacy field — kept for gateway-internal calls (translator.hotl_summary)
    summary: dict[str, Any] | None = None


@app.get("/hotl")
async def list_hotl(request: Request, agent: str | None = None, unread_only: bool = False):
    async with request.app.state.pool.acquire() as conn:
        return await db.list_hotl_logs(conn, request.state.tenant_id, agent=agent, unread_only=unread_only)


@app.post("/hotl")
async def create_hotl(req: HotlCreateRequest, request: Request):
    # Resolve agent name — accept both agent_name (from agent code) and agent (from gateway)
    agent_name = req.agent_name or req.agent or "unknown"

    # When called via internal key, look up the real tenant_id from tenant_agents table
    tenant_id = request.state.tenant_id
    if tenant_id == "internal":
        async with request.app.state.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT ta.tenant_id::text
                FROM tenant_agents ta
                JOIN agent_registry ar ON ta.agent_registry_id = ar.id
                WHERE ar.name = $1
                LIMIT 1
                """,
                agent_name,
            )
        tenant_id = row["tenant_id"] if row else JAMES_TENANT_ID

    # Build summary: prefer explicit summary dict, otherwise build from flat fields
    if req.summary is not None:
        summary = req.summary
    else:
        summary = {
            "overview": req.overview or "",
            "tools": req.tools or [],
            "thoughts": req.thoughts or "",
        }

    async with request.app.state.pool.acquire() as conn:
        log = await db.create_hotl_log(
            conn,
            tenant_id,
            agent_name,
            req.run_id or str(uuid.uuid4()),
            summary,
            cost_usd=req.cost_usd,
            total_tokens=req.total_tokens,
            langsmith_run_id=req.langsmith_run_id,
        )
    return {"id": str(log["id"])}


@app.post("/hotl/clear")
async def clear_hotl(request: Request):
    """Permanently delete all HOTL logs for this tenant. Destructive — confirm in UI before calling."""
    async with request.app.state.pool.acquire() as conn:
        await db.clear_hotl_logs(conn, request.state.tenant_id)
    return {"ok": True}


@app.post("/hotl/read-all")
async def mark_all_hotl_read(request: Request, agent: str | None = None):
    async with request.app.state.pool.acquire() as conn:
        await db.mark_all_hotl_read(conn, request.state.tenant_id, agent=agent)
    return {"ok": True}


@app.post("/hotl/{log_id}/read")
async def mark_hotl_read(log_id: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.mark_hotl_read(conn, request.state.tenant_id, log_id)
    return {"ok": True}


# ─────────────────────────────────────────
# Run records
# ─────────────────────────────────────────

@app.get("/runs")
async def list_runs(request: Request, agent: str | None = None, limit: int = 20):
    """
    List run records for the requesting tenant.
    If `agent` is provided, returns scoped results via list_runs_for_agent.
    limit: default 20, max 100.
    """
    limit = min(limit, 100)
    async with request.app.state.pool.acquire() as conn:
        if agent:
            return await db.list_runs_for_agent(conn, request.state.tenant_id, agent, limit=limit)
        return await db.list_runs(conn, request.state.tenant_id, limit=limit)


@app.post("/runs/start")
async def start_run_endpoint(agent: str, run_id: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.start_run(conn, request.state.tenant_id, agent, run_id)
    return {"ok": True}


class RunFinishRequest(BaseModel):
    status: str
    token_count: int = 0
    cost_usd: float = 0.0
    error_msg: str | None = None


@app.post("/runs/{run_id}/finish")
async def finish_run_endpoint(run_id: str, req: RunFinishRequest, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.finish_run(conn, request.state.tenant_id, run_id, req.status, req.token_count, req.cost_usd, req.error_msg)
    return {"ok": True}


# ─────────────────────────────────────────
# Schedules
# ─────────────────────────────────────────

class ScheduleUpsertRequest(BaseModel):
    agent: str
    workflow: str = "default"  # Use unique names here for multiple schedules
    cron_expr: str
    enabled: bool = True
    task_prompt: str = ""

@app.get("/schedules")
async def list_schedules_endpoint(request: Request):
    async with request.app.state.pool.acquire() as conn:
        return await db.list_schedules(conn, request.state.tenant_id)

@app.post("/schedules")
async def upsert_schedule_endpoint(req: ScheduleUpsertRequest, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.upsert_schedule(
            conn,
            request.state.tenant_id,
            req.agent,
            req.workflow,
            req.cron_expr,
            req.enabled,
            req.task_prompt or None,
        )
    await _reload_schedules()
    return {"ok": True}

@app.delete("/schedules/{agent}/{workflow}")
async def delete_schedule_endpoint(agent: str, workflow: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        await db.delete_schedule(conn, request.state.tenant_id, agent, workflow)
    await _reload_schedules()
    return {"ok": True}


@app.post("/schedules/{agent}/trigger")
async def manual_trigger(agent: str, request: Request, workflow: str = "default"):
    """Manually fire an agent workflow outside its schedule."""
    tenant_id = request.state.tenant_id
    async with request.app.state.pool.acquire() as conn:
        rows = await db.list_schedules(conn, tenant_id, agent=agent)
    sched = next((r for r in rows if r["workflow"] == workflow), None)
    prompt = sched["task_prompt"] if sched else None
    thread_id = str(sched["thread_id"]) if sched and sched.get("thread_id") else None
    asyncio.create_task(trigger_agent_run(tenant_id, agent, workflow, prompt, thread_id))
    return {"ok": True, "message": f"Triggered {agent}/{workflow}"}


# ─────────────────────────────────────────
# Memory / Rules (Postgres — agent_memory / agent_rules tables)
# ─────────────────────────────────────────

@app.get("/agents/{name}/memory")
async def get_memory(name: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        content = await db.get_agent_memory(conn, request.state.tenant_id, name)
    if not content:
        content = "# Memory\n\n_(No content yet — written by the agent during runs.)_\n"
    return {"content": content}


@app.get("/agents/{name}/rules")
async def get_rules(name: str, request: Request):
    async with request.app.state.pool.acquire() as conn:
        content = await db.get_agent_rules(conn, request.state.tenant_id, name)
    if not content:
        content = "# Rules\n\n_(No content yet — this file is managed by the agent.)_\n"
    return {"content": content}


# ─────────────────────────────────────────
# Stats
# ─────────────────────────────────────────

@app.get("/stats")
async def get_stats(request: Request):
    async with request.app.state.pool.acquire() as conn:
        return await db.get_stats(conn, request.state.tenant_id)


# ─────────────────────────────────────────
# Search
# ─────────────────────────────────────────

@app.get("/search")
async def global_search(q: str, request: Request):
    if not q or len(q) < 2:
        return {"results": []}
    q_lower = q.lower()
    results: list[dict] = []

    async with request.app.state.pool.acquire() as conn:
        hotl_logs = await db.list_hotl_logs(conn, request.state.tenant_id, limit=200)
        hitl_items = await db.list_hitl_items(conn, request.state.tenant_id)
        memory_rows = await conn.fetch(
            "SELECT agent, content FROM agent_memory WHERE tenant_id=$1", request.state.tenant_id
        )
        rules_rows = await conn.fetch(
            "SELECT agent, content FROM agent_rules WHERE tenant_id=$1", request.state.tenant_id
        )

    for log in hotl_logs:
        s = log["summary"]
        if isinstance(s, str):
            s = json.loads(s)
        if q_lower in json.dumps(s).lower():
            results.append({
                "type": "hotl",
                "agent": log["agent"],
                "id": str(log["id"]),
                "excerpt": s.get("overview", "")[:120],
                "created_at": str(log["created_at"]),
            })

    for item in hitl_items:
        text = (str(item.get("payload", "")) + " " + (item.get("comment") or "")).lower()
        if q_lower in text:
            results.append({
                "type": "hitl",
                "agent": item["agent"],
                "id": str(item["id"]),
                "excerpt": str(item.get("payload", ""))[:120],
                "created_at": str(item["created_at"]),
            })

    for row in memory_rows:
        content = row["content"] or ""
        if q_lower in content.lower():
            idx = content.lower().index(q_lower)
            start = max(0, idx - 60)
            results.append({
                "type": "memory",
                "agent": row["agent"],
                "id": "MEMORY",
                "excerpt": content[start: idx + 60].strip(),
                "created_at": None,
            })

    for row in rules_rows:
        content = row["content"] or ""
        if q_lower in content.lower():
            idx = content.lower().index(q_lower)
            start = max(0, idx - 60)
            results.append({
                "type": "rules",
                "agent": row["agent"],
                "id": "RULES",
                "excerpt": content[start: idx + 60].strip(),
                "created_at": None,
            })

    return {"results": results[:50]}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
