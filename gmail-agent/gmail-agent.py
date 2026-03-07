import time
import sys
import os
from datetime import datetime
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_community import GmailToolkit
from langchain_google_genai import ChatGoogleGenerativeAI
from typing import List
from dotenv import load_dotenv, find_dotenv
from models import EmailAnalysis, ActionType
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from shared.metrics_callback import MetricsCallback
from shared.auth import get_google_service

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

_NOT_CONNECTED = "Gmail not connected. Click 'Connect' in the dashboard, then restart this agent."
_SCOPES = ["https://mail.google.com/"]
_TOKEN_PATH = os.environ.get("GMAIL_TOKEN_PATH", "../secrets/gmail_token.json")
_CREDS_PATH = os.environ.get("CREDENTIALS_PATH", "../secrets/credentials.json")

_gmail_api = None
try:
    _gmail_api = get_google_service(
        scopes=_SCOPES,
        token_path=_TOKEN_PATH,
        credentials_path=_CREDS_PATH,
        service_name="gmail",
        service_version="v1",
    )
    toolkit = GmailToolkit(api_resource=_gmail_api)
    tools = toolkit.get_tools()
    print("Gmail connected.")
except Exception as e:
    print(f"Gmail not authenticated ({e}). Starting in disconnected mode.")
    toolkit = None

    @tool
    def gmail_not_connected(query: str = "") -> str:
        """Gmail not connected — connect via the dashboard to enable email tools."""
        return _NOT_CONNECTED

    tools = [gmail_not_connected]


@tool
def format_email_output(list_of_emails: List[EmailAnalysis]) -> str:
    """Formats the emails id, thread id, sender, subject, snippet"""
    formatted_output = ""
    for email in list_of_emails:
        formatted_output += "----------------------------------\n"
        formatted_output += f"ID: {email.id}\n"
        formatted_output += f"Thread ID: {email.thread_id}\n"
        formatted_output += f"Sender: {email.sender}\n"
        formatted_output += f"Subject: {email.subject}\n"
        formatted_output += f"Action: {email.action_type}\n"
        if email.action_type == ActionType.REPLY:
            formatted_output += f"Suggested Reply: {email.suggested_reply}\n"
        formatted_output += "----------------------------------\n"
    return formatted_output

@tool
def mark_emails_as_read(email_ids: List[str]) -> str:
    """Marks a list of email IDs as read by removing the 'UNREAD' label."""
    if _gmail_api is None:
        return _NOT_CONNECTED
    try:
        body = {'ids': email_ids, 'removeLabelIds': ['UNREAD']}
        _gmail_api.users().messages().batchModify(userId='me', body=body).execute()
        return f"Successfully marked {len(email_ids)} emails as read."
    except Exception as e:
        return f"Error marking emails as read: {str(e)}"


tools.append(mark_emails_as_read)
tools.append(format_email_output)

# Gmail Tools 
# Create Draft 
# Send Message
# Search 
# Get Message 
# Get Thread


llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)

system_prompt = """You are an advanced ReAct Email Agent. 
Your goal is to manage the user's inbox proactively.

1. **Scan**: Look for new emails in the INBOX.
2. **Filter**: Identify "unnecessary" emails (spam, generic newsletters, promotional ads).
3. **Act**: Immediately use `mark_emails_as_read` for those unnecessary emails.
4. **Reason & Draft**: For important emails:
   - Categorize as 'to read' or 'to reply'.
   - For 'to reply', draft a professional and concise suggested reply. Use `create_draft` to create a draft.
5. **Report**: Use `format_email_output` ONLY for the important emails you processed.

Do not output raw tool arguments. Only output the final formatted report."""

agent = create_agent(
    model=llm,
    tools=tools,
    system_prompt=system_prompt,
)

metrics_cb = MetricsCallback(agent_name="gmail-agent")

def run_agent_cycle():
    print(f"\n--- Starting Polling Cycle: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")

    query = "Search my inbox for the latest emails, analyze them, and format the output."

    events = agent.stream(
        {"messages": [("user", query)]},
        config={"callbacks": [metrics_cb]},
        stream_mode="values",
    )
    for event in events:
        last_message = event["messages"][-1]
        
        # Handle the different message types for cleaner printing
        if hasattr(last_message, 'content'):
            content = last_message.content
            # If Gemini returns a list of parts, join them
            if isinstance(content, list):
                text_parts = [part.get('text', '') for part in content if isinstance(part, dict)]
                print("".join(text_parts))
            else:
                print(content)

if __name__ == "__main__":
    while True:
        try:
            run_agent_cycle()
            print(f"\n--- Cycle Complete: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} waiting 30 minutes---")
            time.sleep(1800) # 30 minutes
        except KeyboardInterrupt:
            print("\n--- Agent Stopped By User ---")
            break
        except Exception as e:
            print(f"\n--- Cycle Failed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
            print(f"Error: {e}")
            time.sleep(60) # 1 minute
    