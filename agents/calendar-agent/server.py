"""
AG-UI server — standard pattern for all agents in jimmys-agents.

Run from repo root:
    make run-{name}

Or directly:
    cd agents/{name} && ../../.venv/bin/uvicorn server:app --host 0.0.0.0 --port {port} --reload

Exposes:
    POST /runs/stream          — AG-UI SSE chat endpoint
    GET  /threads/{id}/state   — session restore (consumed by /api/chat/{agent} GET)
    GET  /runs/stream/health   — health check
"""
from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from fastapi import FastAPI
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint
from langchain_core.messages import HumanMessage, AIMessage

from agent import agent as graph

# ── Update these when copying to a new agent ─────────────────────────────────
_AGENT_NAME = "calendar-agent"   # must match agents.yaml key and agents.ts
_PORT_HINT  = 8099               # documentation only; actual port set in Makefile
# ─────────────────────────────────────────────────────────────────────────────

_DB_PATH = str(Path(__file__).parent.parent.parent / "data" / "checkpoints.db")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # AsyncSqliteSaver persists chat history across server restarts.
    # Shared db for all agents — thread_id namespacing prevents collisions.
    async with AsyncSqliteSaver.from_conn_string(_DB_PATH) as checkpointer:
        graph.checkpointer = checkpointer
        yield


app = FastAPI(title=_AGENT_NAME, lifespan=lifespan)

_ag_ui_agent = LangGraphAgent(name=_AGENT_NAME, graph=graph)
add_langgraph_fastapi_endpoint(app, _ag_ui_agent, path="/runs/stream")


@app.get("/threads/{thread_id}/state")
async def thread_state(thread_id: str):
    """Return thread message history for session restore."""
    config = {"configurable": {"thread_id": thread_id}}
    try:
        state = await graph.aget_state(config)
        msgs = []
        for m in (state.values or {}).get("messages", []):
            if isinstance(m, HumanMessage):
                content = m.content if isinstance(m.content, str) else ""
                msgs.append({"type": "human", "content": content})
            elif isinstance(m, AIMessage):
                content = m.content if isinstance(m.content, str) else ""
                msgs.append({"type": "ai", "content": content})
        return {"values": {"messages": msgs}}
    except Exception:
        return {"values": {"messages": []}}
