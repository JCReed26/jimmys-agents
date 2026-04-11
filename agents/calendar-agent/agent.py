import sys
import os
import json
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from langchain_core.tools import tool
from backend.models import gemini_flash_model as llm
from backend.auth import get_google_service
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_google_community import CalendarToolkit

_AGENT_NAME = "calendar-agent"

_SECRETS = Path(__file__).parent.parent.parent / "secrets"
_SCOPES = ["https://www.googleapis.com/auth/calendar"]

SYSTEM_PROMPT = """You are the Schedule and Todo Optimization Agent. You operate as an independent backend service triggered via an A2A protocol. 

CRITICAL DIRECTIVES:
1. When triggered, you will receive a file path to a JSON payload in the `./workspace/pending_tasks/` directory. You must use `read_workspace_payload` to read this file and extract the scheduling request.
2. Cross-reference the requested time constraints by searching the user's Google Calendar using your Calendar Toolkit, and gathering their pending task list using the Todoist MCP tools.
3. Before creating any events, you MUST check calendar availability using the `search_events` tool to prevent double-booking.
4. If the calendar slot is open, use `create_calendar_event` to explicitly block the time.
5. If there is a scheduling conflict, do not overwrite existing high-priority events. Formulate an alternative proposed time or task arrangement and document the failure/alternative.
6. Consult your Agents.md file for the user's default scheduling preferences (e.g., meeting duration, buffer times) and update it if you notice new recurring constraints.
"""

tools = []

try:
    calendar_service = get_google_service(
        scopes=_SCOPES,
        token_path=str(_SECRETS / "calendar_token.json"),
        credentials_path=str(_SECRETS / "credentials.json"),
        service_name="calendar",
        service_version="v3",
    )
    toolkit = CalendarToolkit(api_resource=calendar_service)
    cal_tools = toolkit.get_tools()
    tools.extend(cal_tools)
    print(f"[{_AGENT_NAME}] Google Calendar connected. Tools: {[t.name for t in cal_tools]}")
except Exception as e:
    print(f"[{_AGENT_NAME}] Calendar auth not found ({e}). Starting in disconnected mode.")
    
    @tool
    def calendar_not_connected(query: str = "") -> str:
        """Calendar not authenticated — add calendar_token.json to secrets/ and restart."""
        return "Calendar is not connected. Run the OAuth flow to authenticate first."
        
    tools.append(calendar_not_connected)


@tool
def read_workspace_payload(filepath: str) -> dict | str:
    """Accepts a filepath, reads the JSON file from the workspace, and returns the parsed dictionary to the agent's context."""
    path = Path(filepath)
    if not path.exists():
        return f"Error: File not found at {filepath}"
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        return data
    except Exception as e:
        return f"Error reading payload: {e}"

tools.append(read_workspace_payload)

# Configure the Todoist MCP client
def get_mcp_tools():
    try:
        loop = asyncio.get_event_loop()
        
        async def fetch_tools():
            try:
                token = os.getenv("TODOIST_API_TOKEN", "")
                if not token:
                    print(f"[{_AGENT_NAME}] TODOIST_API_TOKEN not found in env. MCP will be skipped.")
                    return []
                    
                client = MultiServerMCPClient({
                    "todoist": {
                        "transport": "sse",
                        "url": "https://ai.todoist.net/mcp",
                        "headers": {
                            "Authorization": f"Bearer {token}"
                        }
                    }
                })
                return await client.get_tools()
            except Exception as e:
                print(f"[{_AGENT_NAME}] Error loading MCP tools: {e}")
                return []
                
        if loop.is_running():
            import nest_asyncio
            nest_asyncio.apply()
            
        return loop.run_until_complete(fetch_tools())
    except Exception as e:
        print(f"[{_AGENT_NAME}] Could not initialize MCP client: {e}")
        return []

mcp_tools = get_mcp_tools()
if mcp_tools:
    tools.extend(mcp_tools)
    print(f"[{_AGENT_NAME}] Added {len(mcp_tools)} tools from Todoist MCP.")

backend = FilesystemBackend(root_dir=Path(__file__).parent.absolute())
agent = create_deep_agent(
    model=llm,
    tools=tools,
    system_prompt=SYSTEM_PROMPT,
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    backend=backend,
    name=_AGENT_NAME,
)