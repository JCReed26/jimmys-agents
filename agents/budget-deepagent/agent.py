import os
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from deepagents.middleware import AgentMiddleware
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchRun
from pathlib import Path
from langchain.tools import tool

import csv
import io
from datetime import datetime, timedelta


load_dotenv()

# TODO: Migrate to Ollama to reduce costs
llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    temperature=0.0,
    api_key=os.environ.get("GOOGLE_API_KEY"),
)

tools = [
    DuckDuckGoSearchRun(),
]

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
You are in development; if you need data, use your tools to fetch it.
"""

backend = FilesystemBackend(root_dir=Path(__file__).parent.absolute())
skills = ["skills/"]
memory = ["skills/AGENTS.md"]


class BudgetSyncMiddleware(AgentMiddleware):
    """Syncs Google Sheets ↔ CSV before/after each agent run and posts HOTL logs."""

    async def abefore_agent(self, state, runtime):
        from sheets_to_csv import sync_from_sheets_to_csv
        try:
            sync_from_sheets_to_csv()
        except Exception as e:
            print(f"[BudgetSyncMiddleware] Pre-sync failed (continuing): {e}")
        return None

    async def aafter_agent(self, state, runtime):
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
def ask_human_for_categorization(merchant: str, amount: float, possible_categories: list[str]) -> str:
    """HITL for when you are unsure how to categorize a transaction. Suspends operation until reply."""
    pass

agent = create_deep_agent(
    model=llm,
    tools=tools,
    system_prompt=SYSTEM_PROMPT,
    skills=skills,
    memory=memory,
    backend=backend,
    middleware=[BudgetSyncMiddleware()],
    name="budget-agent",
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
