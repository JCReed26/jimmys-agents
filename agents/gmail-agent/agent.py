import sys
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

SYSTEM_PROMPT = """You are an advanced email management agent.

Your responsibilities:
1. Scan the inbox for new emails
2. Identify and mark unnecessary emails as read (spam, newsletters, promotions)
3. Summarize important emails that need attention
4. Draft professional replies for emails requiring a response using create_draft

Always report what you did clearly. Never send emails directly — only create drafts."""

try:
    creds = get_gmail_credentials(
        token_file=str(_SECRETS / "gmail_token.json"),
        scopes=_SCOPES,
        client_sercret_file=str(_SECRETS / "credentials.json"),  # library typo
    )
    api_resource = build_resource_service(credentials=creds)
    tools = GmailToolkit(api_resource=api_resource).get_tools()
    print(f"[{_AGENT_NAME}] Gmail connected. Tools: {[t.name for t in tools]}")
except Exception as e:
    print(f"[{_AGENT_NAME}] Gmail auth not found ({e}). Starting in disconnected mode.")

    @tool
    def gmail_not_connected(query: str = "") -> str:
        """Gmail not authenticated — add gmail_token.json to secrets/ and restart."""
        return "Gmail is not connected. Run the OAuth flow to authenticate first."

    tools = [gmail_not_connected]

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
