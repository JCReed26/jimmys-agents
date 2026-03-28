import os
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage
from deepagents.middleware import AgentMiddleware
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_community.tools import DuckDuckGoSearchRun
from pathlib import Path

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
You are an agentic budget manager that manages my budget.
You are given csv files that are synced with my budget spreadsheet.
Each CSV file represents one tab from the Google Sheet (e.g. data/Dashboard.csv, data/Expenses.csv).
You manage income and expenses by reading and editing these CSV files.
After you finish making changes, the system will automatically sync your edits back to Google Sheets.

You are in development, this means not everything is working yet and things may start from scratch randomly.
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
