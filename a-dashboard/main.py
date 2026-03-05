import os
import aiohttp
from fastapi import FastAPI, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from db import get_agent_stats, get_recent_runs

load_dotenv()

app = FastAPI()

AGENTS = {
    "gmail-agent":    os.environ.get("AGENT_GMAIL_URL", "http://localhost:8001"),
    "calendar-agent": os.environ.get("AGENT_CALENDAR_URL", "http://localhost:8002"),
    "budget-agent":   os.environ.get("AGENT_BUDGET_URL", "http://localhost:8003"),
    "ticktick-agent": os.environ.get("AGENT_TICKTICK_URL", "http://localhost:8004"),
    "job-app-chain":  None,
}


async def check_agent_health(url: str | None) -> str:
    if url is None:
        return "SHEET"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{url}/ok", timeout=aiohttp.ClientTimeout(total=2)) as r:
                return "RUNNING" if r.status == 200 else "DOWN"
    except Exception:
        return "DOWN"


def _require_templates():
    if templates is None:
        raise HTTPException(503, "Dashboard templates not yet installed")


@app.get("/")
async def index(request: Request):
    _require_templates()
    agent_data = []
    for name, url in AGENTS.items():
        status = await check_agent_health(url)
        stats = await get_agent_stats(name)
        agent_data.append({"name": name, "status": status, **stats})
    return templates.TemplateResponse("index.html", {"request": request, "agents": agent_data})


@app.get("/agent/{name}")
async def agent_detail(request: Request, name: str):
    _require_templates()
    url = AGENTS.get(name)
    status = await check_agent_health(url)
    stats = await get_agent_stats(name)
    runs = await get_recent_runs(name)
    return templates.TemplateResponse("agent.html", {
        "request": request,
        "agent": {"name": name, "status": status, "url": url, **stats},
        "runs": runs,
    })


@app.get("/inbox")
async def inbox(request: Request):
    _require_templates()
    return templates.TemplateResponse("inbox.html", {"request": request})


@app.get("/api/agents")
async def api_agents():
    result = {}
    for name, url in AGENTS.items():
        status = await check_agent_health(url)
        stats = await get_agent_stats(name)
        result[name] = {"status": status, **stats}
    return result


@app.post("/api/agent/{name}/chat")
async def agent_chat(name: str, request: Request):
    url = AGENTS.get(name)
    if not url:
        return {"error": "Agent not available for chat"}
    body = await request.json()

    async def event_stream():
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{url}/stream", json=body) as resp:
                async for chunk in resp.content.iter_any():
                    yield chunk

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# Mount static files and templates (only when directories exist)
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates") if os.path.exists("templates") else None
