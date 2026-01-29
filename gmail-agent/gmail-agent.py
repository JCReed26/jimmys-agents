import time
from datetime import datetime
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_community import GmailToolkit
from langchain_google_genai import ChatGoogleGenerativeAI
from typing import List
from dotenv import load_dotenv
from models import EmailAnalysis, ActionType

load_dotenv()

toolkit = GmailToolkit()
tools = toolkit.get_tools()

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
    try:
        service = toolkit.api_resource
        body = {
            'ids': email_ids,
            'removeLabelIds': ['UNREAD']
        }
        service.users().messages().batchModify(userId='me', body=body).execute()
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
   - For 'to reply', draft a professional and concise suggested reply.
5. **Report**: Use `format_email_output` ONLY for the important emails you processed.

Do not output raw tool arguments. Only output the final formatted report."""

agent_executor = create_agent(
    model=llm, 
    tools=tools, 
    system_prompt=system_prompt
    )

def run_agent_cycle():
    print(f"\n--- Starting Polling Cycle: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")

    query = "Search my inbox for the latest emails, analyze them, and format the output."

    events = agent_executor.stream(
        {"messages": [("user", query)]},
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
    