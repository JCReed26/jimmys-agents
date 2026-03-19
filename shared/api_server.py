"""
jimmys-agents API server (port 8080)
FastAPI + APScheduler backend for the Next.js dashboard.
"""
from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from shared import db

PROJECT_ROOT = Path(__file__).parent.parent

# ─────────────────────────────────────────
# Scheduler setup
# ─────────────────────────────────────────

scheduler = AsyncIOScheduler()


def _agent_url(agent: str) -> str:
    ports = {
        "gmail-agent": 8001,
        "calendar-agent": 8002,
        "budget-agent": 8003,
        "job-app-chain": 8004,
    }
    return f"http://localhost:{ports.get(agent, 9999)}"


async def trigger_agent_run(agent: str, task_prompt: str | None = None):
    """Fire a LangGraph /invoke call for the given agent."""
    run_id = str(uuid.uuid4())
    db.run_start(agent, run_id)

    prompt = task_prompt or "Run your scheduled task."
    payload = {"input": {"messages": [{"role": "user", "content": prompt}]}}

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(f"{_agent_url(agent)}/invoke", json=payload)
            r.raise_for_status()
            db.run_finish(run_id, "done")
    except Exception as e:
        db.run_finish(run_id, "error", error_msg=str(e))


def _reload_schedules():
    """Sync APScheduler with the schedules table."""
    for row in db.schedule_list():
        job_id = f"agent_{row['agent']}"
        if scheduler.get_job(job_id):
            scheduler.remove_job(job_id)
        if row["enabled"]:
            try:
                trigger = CronTrigger.from_crontab(row["cron_expr"])
                scheduler.add_job(
                    trigger_agent_run,
                    trigger=trigger,
                    id=job_id,
                    args=[row["agent"], row.get("task_prompt")],
                    replace_existing=True,
                )
            except Exception:
                pass  # invalid cron — skip


@asynccontextmanager
async def lifespan(app: FastAPI):
    _reload_schedules()
    scheduler.start()
    yield
    scheduler.shutdown()


# ─────────────────────────────────────────
# App
# ─────────────────────────────────────────

app = FastAPI(title="jimmys-agents API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────
# WebSocket manager for live run streams
# ─────────────────────────────────────────

class WSManager:
    def __init__(self):
        self._sockets: dict[str, list[WebSocket]] = {}

    def register(self, key: str, ws: WebSocket):
        self._sockets.setdefault(key, []).append(ws)

    def deregister(self, key: str, ws: WebSocket):
        self._sockets.get(key, []).remove(ws) if ws in self._sockets.get(key, []) else None

    async def broadcast(self, key: str, data: dict):
        dead = []
        for ws in self._sockets.get(key, []):
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.deregister(key, ws)


ws_manager = WSManager()


@app.websocket("/ws/{agent}")
async def ws_agent(websocket: WebSocket, agent: str):
    await websocket.accept()
    ws_manager.register(agent, websocket)
    try:
        while True:
            await asyncio.sleep(30)  # keep alive
    except WebSocketDisconnect:
        ws_manager.deregister(agent, websocket)


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
# Agent status
# ─────────────────────────────────────────

@app.get("/agents")
async def agents_status():
    ports = {"gmail-agent": 8001, "calendar-agent": 8002, "budget-agent": 8003, "job-app-chain": 8004}
    results = {}
    async with httpx.AsyncClient(timeout=2) as client:
        for name, port in ports.items():
            try:
                r = await client.get(f"http://localhost:{port}/ok")
                results[name] = {"status": "RUNNING" if r.status_code == 200 else "DOWN"}
            except Exception:
                results[name] = {"status": "DOWN"}

    # Enrich with schedule info
    for sched in db.schedule_list():
        agent = sched["agent"]
        if agent in results:
            results[agent]["nextRun"] = sched.get("next_run")
            results[agent]["lastRun"] = sched.get("last_run")
            results[agent]["schedEnabled"] = bool(sched["enabled"])

    # Enrich with HITL counts
    for item in db.hitl_list(status="pending"):
        agent = item["agent"]
        if agent in results:
            results[agent]["hitlCount"] = results[agent].get("hitlCount", 0) + 1

    return results


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
# Stream events
# ─────────────────────────────────────────

class StreamEventRequest(BaseModel):
    agent: str
    run_id: str
    event_type: str
    payload: dict[str, Any]
    seq: int


@app.post("/stream-events")
async def post_stream_event(req: StreamEventRequest):
    db.stream_event_append(req.agent, req.run_id, req.event_type, req.payload, req.seq)
    # Also push to any connected WebSocket clients
    await ws_manager.broadcast(req.agent, {
        "type": req.event_type,
        "payload": req.payload,
        "seq": req.seq,
        "run_id": req.run_id,
    })
    return {"ok": True}


@app.get("/stream-events/{agent}/{run_id}")
def get_stream_events(agent: str, run_id: str):
    return db.stream_events_get(agent, run_id)


# ─────────────────────────────────────────
# Schedules
# ─────────────────────────────────────────

class ScheduleUpsertRequest(BaseModel):
    agent: str
    cron_expr: str
    enabled: bool = True
    task_prompt: str = ""


@app.get("/schedules")
def list_schedules():
    return db.schedule_list()


@app.post("/schedules")
def upsert_schedule(req: ScheduleUpsertRequest):
    db.schedule_upsert(req.agent, req.cron_expr, req.enabled, req.task_prompt)
    _reload_schedules()  # hot-reload
    return {"ok": True}


@app.post("/schedules/{agent}/trigger")
async def manual_trigger(agent: str):
    """Manually fire an agent run outside the schedule."""
    sched = db.schedule_get(agent)
    prompt = sched["task_prompt"] if sched else None
    asyncio.create_task(trigger_agent_run(agent, prompt))
    return {"ok": True, "message": f"Triggered {agent}"}


# ─────────────────────────────────────────
# Memory / Rules (file-based)
# ─────────────────────────────────────────

AGENT_DIRS = {
    "gmail-agent":    PROJECT_ROOT / "gmail-agent",
    "calendar-agent": PROJECT_ROOT / "calendar-agent",
    "budget-agent":   PROJECT_ROOT / "budget-agent",
    "job-app-chain":  PROJECT_ROOT / "job-app-chain",
}


def _read_file(agent: str, filename: str) -> str:
    path = AGENT_DIRS.get(agent, PROJECT_ROOT) / filename
    if path.exists():
        return path.read_text()
    return f"# {filename}\n\n_(No content yet — this file is managed by the agent.)_\n"


@app.get("/agents/{agent}/memory")
def get_memory(agent: str):
    return {"content": _read_file(agent, "MEMORY.md")}


@app.get("/agents/{agent}/rules")
def get_rules(agent: str):
    return {"content": _read_file(agent, "RULES.md")}


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

    # Search HOTL logs
    for log in db.hotl_list():
        s = log["summary"]
        text = json.dumps(s).lower()
        if q_lower in text:
            results.append({
                "type": "hotl",
                "agent": log["agent"],
                "id": log["id"],
                "excerpt": s.get("overview", "")[:120],
                "created_at": log["created_at"],
            })

    # Search HITL items
    for item in db.hitl_list():
        text = (item.get("payload", "") + " " + item.get("comment", "")).lower()
        if q_lower in text:
            results.append({
                "type": "hitl",
                "agent": item["agent"],
                "id": item["id"],
                "excerpt": str(item.get("payload", ""))[:120],
                "created_at": item["created_at"],
            })

    # Search memory files
    for agent, agent_dir in AGENT_DIRS.items():
        for fname in ("MEMORY.md", "RULES.md"):
            fpath = agent_dir / fname
            if fpath.exists():
                content = fpath.read_text()
                if q_lower in content.lower():
                    # find surrounding snippet
                    idx = content.lower().index(q_lower)
                    start = max(0, idx - 60)
                    excerpt = content[start:idx + 60].strip()
                    results.append({
                        "type": "memory" if fname == "MEMORY.md" else "rules",
                        "agent": agent,
                        "id": fname,
                        "excerpt": excerpt,
                        "created_at": None,
                    })

    return {"results": results[:50]}


# ─────────────────────────────────────────
# Council
# ─────────────────────────────────────────

class ContractCreateRequest(BaseModel):
    title: str
    parties: list[str]
    terms_md: str


class ContractUpdateRequest(BaseModel):
    status: str | None = None
    terms_md: str | None = None


@app.get("/council/contracts")
def list_contracts():
    return db.council_contracts_list()


@app.post("/council/contracts")
def create_contract(req: ContractCreateRequest):
    cid = db.council_contract_create(req.title, req.parties, req.terms_md)
    return {"id": cid}


@app.patch("/council/contracts/{contract_id}")
def update_contract(contract_id: int, req: ContractUpdateRequest):
    db.council_contract_update(contract_id, req.status, req.terms_md)
    return {"ok": True}


@app.get("/council/messages")
def list_messages(limit: int = 100):
    msgs = db.council_messages_list(limit)
    msgs.reverse()
    return msgs


@app.post("/council/messages")
def post_message(sender: str, content: str):
    mid = db.council_message_post(sender, content)
    return {"id": mid}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
