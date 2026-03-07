import os
import json
import time
from typing import Literal, List, Optional, Dict, Any
from typing_extensions import TypedDict, Annotated
import operator

import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from shared.auth import get_google_service
from shared.metrics_callback import MetricsCallback

from langchain.messages import (
    AnyMessage,
    SystemMessage,
    HumanMessage,
)
from langchain_core.tools import tool, BaseTool
from langchain_google_community import SheetsToolkit
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.prebuilt import ToolNode

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())
# Explicitly load from parent directory to ensure it works with langgraph dev
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path, override=True)

# Strip whitespace from API key just in case
if "GOOGLE_API_KEY" in os.environ:
    os.environ["GOOGLE_API_KEY"] = os.environ["GOOGLE_API_KEY"].strip()

print(f"DEBUG: .env path: {env_path}")
print(f"DEBUG: GOOGLE_API_KEY present: {'GOOGLE_API_KEY' in os.environ}")
if 'GOOGLE_API_KEY' in os.environ:
    print(f"DEBUG: GOOGLE_API_KEY prefix: {os.environ['GOOGLE_API_KEY'][:5]}")
    print(f"DEBUG: GOOGLE_API_KEY length: {len(os.environ['GOOGLE_API_KEY'])}")

# Config
STATE_FILE = os.environ.get("BUDGET_STATE_FILE", "../data/budget_state.json")

# State Manager for Budget Agent
class BudgetManager:
    def __init__(self, service):
        self.service = service
        self.spreadsheet_id = None
        self.sheet_names = []
        self.load_state()

    def load_state(self):
        """Loads the spreadsheet ID from local JSON state file."""
        if os.path.exists(STATE_FILE):
            try:
                with open(STATE_FILE, 'r') as f:
                    data = json.load(f)
                    self.spreadsheet_id = data.get("spreadsheet_id")
                    self.sheet_names = data.get("sheet_names", [])
            except Exception as e:
                print(f"Warning: Could not load state file: {e}")

    def save_state(self):
        """Saves current state to local JSON file."""
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        with open(STATE_FILE, 'w') as f:
            json.dump({
                "spreadsheet_id": self.spreadsheet_id,
                "sheet_names": self.sheet_names,
                "last_updated": time.time()
            }, f, indent=2)

    def set_spreadsheet_id(self, spreadsheet_id: str):
        """Sets the ID and immediately syncs metadata."""
        self.spreadsheet_id = spreadsheet_id
        self.sync_metadata()
        self.save_state()

    def sync_metadata(self):
        """Fetches current sheet names from the API and updates local cache."""
        if not self.spreadsheet_id:
            return

        try:
            meta = self.service.spreadsheets().get(spreadsheetId=self.spreadsheet_id).execute()
            sheets = meta.get('sheets', [])
            self.sheet_names = [s['properties']['title'] for s in sheets]
            self.save_state()
            print(f"[BudgetManager] Synced metadata. Sheets found: {self.sheet_names}")
        except Exception as e:
            print(f"[BudgetManager] Error syncing metadata: {e}")

    def add_worksheet(self, title: str):
        """Adds a new worksheet (tab) to the spreadsheet."""
        if not self.spreadsheet_id:
            raise ValueError("No spreadsheet ID set.")

        body = {
            "requests": [{
                "addSheet": {
                    "properties": {"title": title}
                }
            }]
        }
        self.service.spreadsheets().batchUpdate(
            spreadsheetId=self.spreadsheet_id,
            body=body
        ).execute()
        # Update cache
        if title not in self.sheet_names:
            self.sheet_names.append(title)
            self.save_state()
        return f"Successfully added new sheet: '{title}'"


def save_budget_spreadsheet_id_tool(spreadsheet_id: str):
    """Call this tool IMMEDIATELY after creating a new spreadsheet to save its ID for future use."""
    manager.set_spreadsheet_id(spreadsheet_id)
    return f"Successfully saved spreadsheet ID {spreadsheet_id}. Metadata synced."


def add_worksheet_tool(title: str):
    """Adds a new worksheet (tab) to the current spreadsheet. Use this to create 'Dashboard' or 'Transactions' sheets."""
    try:
        return manager.add_worksheet(title)
    except Exception as e:
        return f"Error adding sheet '{title}': {str(e)}"


def refresh_spreadsheet_metadata_tool():
    """Refreshes the internal cache of sheet names. Call this if you suspect the sheet structure has changed outside of your actions."""
    manager.sync_metadata()
    return f"Metadata refreshed. Current sheets: {manager.sheet_names}"


def create_budget_tools(manager: BudgetManager, toolkit: SheetsToolkit) -> List[BaseTool]:
    """Creates a list of tools including patched standard tools and custom management tools."""

    # Create simple Tool objects from functions
    save_tool = tool(save_budget_spreadsheet_id_tool)
    add_sheet_tool = tool(add_worksheet_tool)
    refresh_tool = tool(refresh_spreadsheet_metadata_tool)

    # Patch Standard Tools (Gemini Compatibility)
    standard_tools = toolkit.get_tools()
    fixed_tools = []

    for tool_obj in standard_tools:
        # Filter out complex 'batch' tools that break Gemini
        if "batch" in tool_obj.name:
            continue

        # Patch 'values' (used in Update/Append)
        if "values" in tool_obj.args:
            if hasattr(tool_obj.args_schema, "model_fields"):
                tool_obj.args_schema.model_fields["values"].annotation = List[List[str]]
                if hasattr(tool_obj.args_schema, "model_rebuild"):
                    tool_obj.args_schema.model_rebuild()

        # Patch 'initial_data' (used in Create)
        if "initial_data" in tool_obj.args:
            if hasattr(tool_obj.args_schema, "model_fields"):
                tool_obj.args_schema.model_fields["initial_data"].annotation = Optional[List[List[str]]]
                if hasattr(tool_obj.args_schema, "model_rebuild"):
                    tool_obj.args_schema.model_rebuild()

        fixed_tools.append(tool_obj)

    return fixed_tools + [save_tool, add_sheet_tool, refresh_tool]


BASE_SYSTEM_PROMPT = """You are the **Budget Agentic Manager**, operating with the wit and folksy wisdom of **Senator John Kennedy**.
You have full scope over the user's budget. Your goal is to manage the budget effectively while keeping the user entertained (and slightly shamed) into financial responsibility.

### PERSONA GUIDELINES
- Speak with the distinct voice of Senator John Kennedy. Use folksy analogies, rhetorical questions, and colorful idioms.
- **The Roast**: If the user has an unbalanced budget or spends frivolously, roast them gently but firmly.
  - *Example:* "You're spending money like you're in Congress, but you don't have the printer."
  - *Example:* "This budget is messier than a pig in a parlor."

### CORE OBJECTIVES
1. **Manage:** Organize the budget into clear, logical sheets.
2. **Track:** Log spending accurately and update totals.
3. **Refine:** meaningful descriptions and categories.
4. **Adapt:** Reschedule dynamically when conflicts arise.

### GOOGLE SHEETS BEST PRACTICES (CRITICAL)
You are interfacing with a Google Sheet. Follow these rules to ensure the sheet is usable and professional:

1.  **Structure:**
    -   **'Dashboard' Sheet:** Create a main sheet named 'Dashboard' for high-level summaries (Income vs Expenses, Net, Charts).
    -   **Category Sheets:** Use separate sheets (tabs) for major categories if detailed tracking is needed (e.g., 'Transactions', 'Wants', 'Needs').
2.  **Data Entry:**
    -   **A1 Notation:** Always use proper A1 notation for ranges (e.g., `Sheet1!A1:B10`).
    -   **Headers:** Always ensure the first row of a new list or sheet contains bold headers.
    -   **Dynamic Math:** PREFER writing spreadsheet formulas (e.g., `=SUM(B2:B100)`) into cells instead of calculating static numbers yourself. This keeps the sheet alive.
3.  **Reading & Writing:**
    -   Before adding data, **READ** the relevant range to find the first empty row. Do not overwrite existing data unless explicitly instructed.
    -   When creating a budget, verify if the sheet names already exist.

### CORE WORKFLOWS
1.  **Chat Question:** Answer questions about the budget using data read directly from the sheet.
2.  **Process Receipt:** Extract details (Date, Merchant, Amount, Category) and append them to the 'Transactions' sheet.
3.  **Create Budget:**
    -   Initialize a 'Dashboard' and a 'Transactions' sheet.
    -   Set up summary formulas on the Dashboard that reference the Transactions sheet.
4.  **Analyze Spending:** Read the 'Transactions' sheet and summarize by category.

### SAFETY & VERIFICATION
-   **Verify the Math:** After updating the sheet, read back the totals to ensure your formulas or edits resulted in the correct numbers.
-   **Check Before Action:** Read the current state of a sheet before making changes to avoid data loss.
-   **Privacy:** Never output raw API credentials or sensitive tokens.

Now, look at this budget and tell me what you see. And don't sugarcoat it.
"""

# ==============================================================================
# AGENT GRAPH
# ==============================================================================

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

# Initialize Services
try:
    service = get_google_service(
        scopes=SCOPES,
        token_path=os.environ.get("SHEETS_TOKEN_PATH", "../secrets/sheets_token.json"),
        credentials_path=os.environ.get("CREDENTIALS_PATH", "../secrets/credentials.json"),
        service_name="sheets",
        service_version="v4",
    )
    toolkit = SheetsToolkit(api_resource=service)
    manager = BudgetManager(service)
    tools = create_budget_tools(manager, toolkit)
    if manager.spreadsheet_id:
        manager.sync_metadata()
        print(f"[System] Loaded existing budget ID: {manager.spreadsheet_id}")
    else:
        print("[System] No existing budget found.")
except Exception as e:
    print(f"Sheets not authenticated ({e}). Starting in disconnected mode.")
    service = None
    toolkit = None
    manager = None

    @tool
    def sheets_not_connected(query: str = "") -> str:
        """Budget tools not connected — connect via the dashboard to enable budget tools."""
        return "Sheets not connected. Click 'Connect' in the dashboard, then restart this agent."

    tools = [sheets_not_connected]

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)
llm_with_tools = llm.bind_tools(tools)

class MessageState(TypedDict):
    messages: Annotated[list[AnyMessage], operator.add]

def llm_call(state: dict):
    """LLM Decides whether to call a tool or not"""
    # Dynamic System Prompt Injection
    current_prompt = BASE_SYSTEM_PROMPT
    if manager and manager.spreadsheet_id:
        current_prompt += f"\n\n### CURRENT STATE (LIVE CACHE)\n- **Spreadsheet ID:** {manager.spreadsheet_id}\n- **Known Sheets:** {manager.sheet_names}\nUse this metadata to avoid guessing sheet names."

    try:
        response = llm_with_tools.invoke(
            [SystemMessage(content=current_prompt)] + state["messages"]
        )
        return {
            "messages": [response]
        }
    except Exception as e:
        raise e

tool_node = ToolNode(tools)

def should_continue(state: MessageState) -> Literal["tool_node", END]:
    """Decide if we should continue the loop or stop based upon whether the llm made a tool call"""
    messages = state["messages"]
    last_message = messages[-1]

    if last_message.tool_calls:
        return "tool_node"
    else:
        return END

# Build the graph
agent_builder = StateGraph(MessageState)

agent_builder.add_node("llm_call", llm_call)
agent_builder.add_node("tool_node", tool_node)

agent_builder.add_edge(START, "llm_call")
agent_builder.add_conditional_edges(
    "llm_call",
    should_continue,
    ["tool_node", END]
)
agent_builder.add_edge("tool_node", "llm_call")

memory = InMemorySaver()
# agent = agent_builder.compile(checkpointer=memory)
# For LangGraph API (langgraph dev), we must NOT pass a checkpointer
agent = agent_builder.compile()

if __name__ == "__main__":
    print("Starting Budget Agent with Smart Metadata Manager...")

    config = {"configurable": {"thread_id": "1"}}
    metrics_cb = MetricsCallback(agent_name="budget-agent")

    while True:
        try:
            user_input = input("\nUser> ")
            if user_input.lower() in ['q', 'quit', 'exit']:
                print("Goodbye!")
                break

            events = agent.stream(
                {"messages": [HumanMessage(content=user_input)]},
                config={**config, "callbacks": [metrics_cb]},
                stream_mode="values",
            )

            for event in events:
                if "messages" in event:
                    last_msg = event["messages"][-1]

                    if last_msg.type == "ai":
                        print(f"Agent: {last_msg.content}")

        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"\nAn error occurred: {e}")
            break
