"""
AG-UI server for budget-deepagent.

Run from repo root:
    make run-budget

Or directly:
    cd agents/budget-deepagent && ../../.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8003

Exposes:
    POST /runs/stream          — AG-UI SSE chat endpoint (consumed by api gateway)
    GET  /threads/{id}/state   — session restore (consumed by /chat/{agent}/history)
    GET  /runs/stream/health   — health check
"""
from __future__ import annotations

import sys
from pathlib import Path

# Add project root so backend/ imports work
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from fastapi import FastAPI
from ag_ui_langgraph import LangGraphAgent, add_langgraph_fastapi_endpoint
from langchain_core.messages import HumanMessage, AIMessage

from agent import agent as graph  # CompiledStateGraph defined in agent.py

app = FastAPI(title="budget-agent")

_ag_ui_agent = LangGraphAgent(name="budget-agent", graph=graph)
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
