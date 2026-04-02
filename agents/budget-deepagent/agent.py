import os
import sys
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.memory import MemorySaver
from deepagents.middleware import SkillsMiddleware, MemoryMiddleware, FilesystemMiddleware
from deepagents import middle
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_community.tools import DuckDuckGoSearchRun
from pathlib import Path
from langchain.tools import tool
from langchain_google_community.sheets import SheetsToolkit

import csv
import io
import json
import httpx

from datetime import datetime, timedelta

load_dotenv()

# Import LLM from shared models — swap model here to change cost profile:
#   gemini_flash_model  — Google Gemini 2.5 Flash via OpenRouter (low cost, default)
#   cheap_haiku_three_model — Claude 3 Haiku via OpenRouter (very cheap)
#   free_nvidia_model   — nvidia/llama-3.1-nemotron-70b-instruct (free, rate-limited)
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from backend.models import gemini_flash_model as llm

SYSTEM_PROMPT = """
You are an uncompromising, highly capable financial advisor agent managing my budget. 
Your goal is to keep me on track financially, brutally holding me to my goals.

PERSONA & TONE:
- Be direct, professional, and hold me strictly accountable. 
- If I overspend or make a bad financial decision, creatively insult me (be witty, sarcastic, or disappointed), but then immediately move on and focus on the solution. Do not dwell on it.
- Keep your daily digests concise and actionable.

CORE RULES:
1. ALWAYS check `skills/AGENTS.md` to understand how my specific budget is set up, what my current goals are, and how detailed my receipt tracking should be (e.g., full itemization vs. totals only).
2. NEVER reallocate budget limits for a month without explicitly asking for my approval using the Human-in-the-Loop (HITL) tool.
3. At the end of the month, any remaining unspent budget MUST be split 50/50 between my active saving goals and an Emergency Fund.

You manage income and expenses by reading and editing CSV files in `data/` that are synced with Google Sheets.

You can also manage multiple budgets for a single user by separating them into different directories.

The google sheet will have a tab for each csv file that you have. and when they are pulled from the google sheet the tab will be named as the csv file.

You are in development; if you need data, use your tools to fetch it.
"""

class BudgetSyncMiddleware():
    """Syncs Google Sheets ↔ CSV before/after each agent run and posts HOTL logs."""

    async def before_agent(self, state, runtime):
        from sheets_to_csv import sync_from_sheets_to_csv
        try:
            sync_from_sheets_to_csv()
        except Exception as e:
            print(f"[BudgetSyncMiddleware] Pre-sync failed (continuing): {e}")
        return None

    async def after_agent(self, state, runtime):
        from sheets_to_csv import sync_from_csv_to_sheets
        try:
            sync_from_csv_to_sheets()
        except Exception as e:
            print(f"[BudgetSyncMiddleware] Post-sync failed: {e}")
        return None

@tool
def fetch_latest_bank_transactions(days_back: int = 3) -> str:
    """Fetch the latest transactions via fintable or plaid. returns csv formatted string."""
    # Fake data for testing the daily-checkin skill
    return """date,description,amount,type
2026-03-27,UBER EATS,-35.50,debit
2026-03-28,STARBUCKS,-6.45,debit
2026-03-28,SOFI INTEREST,12.00,credit
2026-03-28,AMAZON.COM,-145.99,debit"""

@tool
async def request_human_approval(description: str, payload: str) -> str:
    """
    Suspends operation to request human approval via the dashboard.
    MUST be used for budget reallocation or month-end rollovers.
    ARGS:
      description: a short string describing the request
      payload: json str containing details for the user to review
    """
    import asyncio

    try:
        payload_dict = json.loads(payload)
    except json.JSONDecodeError:
        payload_dict = {"data": payload}

    internal_key = os.environ.get("INTERNAL_API_KEY", "")

    # create hitl request on the gateway
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            "http://localhost:8080/hitl",
            headers={"X-Internal-Key": internal_key},
            json={
                "agent_name": "budget-deepagent",
                "item_type": "approval",
                "payload": {"description": description, **payload_dict},
            },
        )
    resp.raise_for_status()
    resp_id = resp.json()["id"]

    print(f"[HITL] Created approval request #{resp_id}. Waiting for dashboard resolution...\n")

    # poll until response
    while True:
        async with httpx.AsyncClient(timeout=5.0) as client:
            status_resp = (await client.get(
                f"http://localhost:8080/hitl/{resp_id}",
                headers={"X-Internal-Key": internal_key},
            )).json()
        if status_resp["status"] != "pending":
            decision = status_resp["status"]
            comment = status_resp.get("comment", "No comment provided")
            return f"Human decision: {decision}. Human Comment: {comment}"

        await asyncio.sleep(30)  # poll every 30 seconds

tools = [
    DuckDuckGoSearchRun(),
    fetch_latest_bank_transactions,
    request_human_approval,
]

backend = FilesystemBackend(root_dir=Path(__file__).parent.absolute())
skills = ["skills/"]
memory = ["skills/AGENTS.md"]
checkpointer = MemorySaver()

agent = create_deep_agent(
    model=llm,
    tools=tools,
    system_prompt=SYSTEM_PROMPT,
    skills=skills,
    memory=memory,
    backend=backend,
    middleware=[
        BudgetSyncMiddleware(), 
        SkillsMiddleware(), 
        MemoryMiddleware(), 
        FilesystemMiddleware(),
    ],
    interrupt_on={
        "fetch_latest_bank_transactions": False,    # no interrupt
        "request_human_approval": True,             # approve, edit, reject
    },  
    checkpointer=checkpointer,
    name="Financial Assistant",
)


async def run_agent_cycle(input_message: str, thread_id: str = None):
    """Run agent from API/Chat/Scheduler. Returns all agent steps."""
    config = {"configurable": {"thread_id": thread_id or f"thread-{os.urandom(8).hex()}"}}

    async for chunk in agent.astream(
        {"messages": [HumanMessage(content=input_message)]},
        config=config,
        stream_mode="updates",
        version="v2",
    ):
        if chunk["type"] == "updates":
            for step, data in chunk["data"].items():
                print(f"Step: {step}")
                if data.get("messages"):
                    print(f"Data: {data['messages'][-1].content}")
