import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from langchain_core.tools import tool
from langchain_google_community import GmailToolkit
from langchain_google_community.gmail.utils import build_resource_service, get_gmail_credentials
from backend.models import gemini_flash_model as llm
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend

_AGENT_NAME = "gmail-agent"

_SECRETS = Path(__file__).parent.parent.parent / "secrets"
_SCOPES = ["https://mail.google.com/"]

SYSTEM_PROMPT = """You are the Schedule and Todo Optimization Agent, an autonomous backend service that manages the user's Google Calendar and Todoist tasks. You are typically triggered via an A2A protocol from other agents.

CRITICAL DIRECTIVES:
1. When triggered with a workspace JSON file path (e.g., from the Email Agent), immediately use `read_workspace_payload` to parse the requested task, participants, and scheduling constraints.
2. Check existing commitments. Cross-reference the requested time with the user's Google Calendar availability and their pending Todoist tasks.
3. Manage conflicts proactively. If a slot is open, block the time explicitly using your Calendar tools. If there is a scheduling conflict, do not overwrite existing high-priority events; instead, formulate an alternative proposed time or rearrange flexible tasks.
4. Keep tasks synced. When you schedule a meeting that implies preparation work, or when you extract a pure task from a payload, create it in Todoist via the Todoist MCP.
5. Consult your AGENTS.md file for ongoing context, working hours, default meeting buffers, and formatting rules."""

@tool
def write_to_workspace(task_details_json: str) -> str:
    """Accepts a JSON-formatted string of extracted task details and writes it securely to .workspace/pending_tasks/."""
    # check if exists
    workspace_dir = Path("./workspace/pending_tasks")
    if not workspace_dir.exists():
        workspace_dir.mkdir(parents=True, exist_ok=True)
    
    # get file name and path
    filename = f"task_{int(time.time())}.json"
    filepath = workspace_dir / filename

    # write the file
    with open(filepath, 'w') as f:
        f.write(task_details_json)

    return str(filepath)

@tool
def trigger_calendar_agent(filepath: str) -> str:
    """Pings calendar agent that a new task in available in the workspace"""
    return "A2A NOT YET CONFIGURED. DO NOTHING. INFORM USER"

try:
    creds = get_gmail_credentials(
        token_file=str(_SECRETS / "gmail_token.json"),
        scopes=_SCOPES,
        client_sercret_file=str(_SECRETS / "credentials.json"),  # library typo
    )
    api_resource = build_resource_service(credentials=creds)
    tools = GmailToolkit(api_resource=api_resource).get_tools()
    tools.append(write_to_workspace)
    tools.append(trigger_calendar_agent)
    print(f"[{_AGENT_NAME}] Gmail connected. Tools: {[t.name for t in tools]}")
except Exception as e:
    print(f"[{_AGENT_NAME}] Gmail auth not found ({e}). Starting in disconnected mode.")

    @tool
    def gmail_not_connected(query: str = "") -> str:
        """Gmail not authenticated — add gmail_token.json to secrets/ and restart."""
        return "Gmail is not connected. Run the OAuth flow to authenticate first."

    tools = [gmail_not_connected]
    tools.append(write_to_workspace)
    tools.append(trigger_calendar_agent)
    print(f"[{_AGENT_NAME}] Gmail not connected. Tools: {[t.name for t in tools]}")

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
