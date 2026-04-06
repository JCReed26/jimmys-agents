"""
AG-UI server — standard pattern for all agents in jimmys-agents.

Run from repo root:
    .venv/bin/uvicorn agents.<name>.server:app --host 0.0.0.0 --port <port>

Or add a Makefile target:
    run-{name}:
        cd agents/{name} && ../../.venv/bin/uvicorn server:app --host 0.0.0.0 --port {port}

Exposes:
    POST /runs/stream          — AG-UI SSE chat (gateway calls this)
    GET  /threads/{id}/state   — session restore (gateway's /chat/{agent}/history calls this)
    GET  /runs/stream/health   — health check
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from fastapi import FastAPI
from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint
from langchain_core.messages import HumanMessage, AIMessage

from agent import agent as graph  # CompiledStateGraph from agent.py

# ── Update these two values when copying to a new agent ──────────────────────
_AGENT_NAME = "template-agent"   # must match agents.yaml key
_PORT_HINT  = 8099               # for documentation only; actual port set in Makefile
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title=_AGENT_NAME)

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
