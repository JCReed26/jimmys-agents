import os
import datetime
from datetime import timedelta
from typing import List, Dict, Optional
from dotenv import load_dotenv

# Google Auth & API Imports
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# LangChain Imports
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import InMemorySaver

load_dotenv()

# --- 1. AUTHENTICATION & SETUP ---

# We use a separate token file to avoid conflicts with your Gmail agent
SCOPES = ['https://www.googleapis.com/auth/calendar']
TOKEN_FILE = 'calendar_token.json'
CREDENTIALS_FILE = '../credentials.json' # Assumes running from calendar-agent/ or adjust path

def get_calendar_service():
    """Authenticates and returns the Google Calendar API service."""
    creds = None
    
    # Adjust path if running from root vs folder
    token_path = TOKEN_FILE
    if not os.path.exists(token_path) and os.path.exists(f"calendar-agent/{TOKEN_FILE}"):
        token_path = f"calendar-agent/{TOKEN_FILE}"
        
    creds_path = CREDENTIALS_FILE
    if not os.path.exists(creds_path):
        # Try looking in current dir or root
        if os.path.exists("credentials.json"):
            creds_path = "credentials.json"
        elif os.path.exists("../credentials.json"):
             creds_path = "../credentials.json"

    # 1. Try to load existing token
    if os.path.exists(token_path):
        try:
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
        except Exception:
            print("Corrupt token file, re-authenticating...")
            creds = None

    # 2. Refresh or Login if needed
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception:
                print("Token refresh failed, re-authenticating...")
                creds = None
        
        if not creds:
            if not os.path.exists(creds_path):
                raise FileNotFoundError(f"Missing credentials.json at {creds_path}. Please download it from Google Cloud Console.")
                
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)
        
        # Save the new token
        with open(token_path, 'w') as token:
            token.write(creds.to_json())

    return build('calendar', 'v3', credentials=creds)

# Initialize Service
try:
    calendar_service = get_calendar_service()
    print("Successfully connected to Google Calendar API")
except Exception as e:
    print(f"Failed to connect to Calendar API: {e}")
    exit(1)

# --- 2. CUSTOM TOOLS (The "Full Overview" Capability) ---

@tool
def get_current_datetime():
    """Get the current date and time. ALWAYS call this first to orient yourself."""
    now = datetime.datetime.now()
    return {
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": str(now.astimezone().tzinfo),
        "day_of_week": now.strftime("%A")
    }

@tool
def list_calendars():
    """List all calendars the user has access to."""
    try:
        calendars = calendar_service.calendarList().list().execute()
        return [
            {"id": c['id'], "summary": c.get('summary', 'No Title'), "primary": c.get('primary', False)}
            for c in calendars.get('items', [])
        ]
    except Exception as e:
        return f"Error listing calendars: {e}"

@tool
def get_detailed_agenda(days: int = 7, calendar_id: str = 'primary'):
    """
    Get a detailed list of events for the next N days.
    Crucial for checking conflicts before scheduling.
    
    Args:
        days: Number of days to look ahead (default 7)
        calendar_id: The calendar to check (default 'primary')
    """
    try:
        now = datetime.datetime.now().astimezone()
        end = now + timedelta(days=days)
        
        events_result = calendar_service.events().list(
            calendarId=calendar_id,
            timeMin=now.isoformat() + 'Z',
            timeMax=end.isoformat() + 'Z',
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        
        events = events_result.get('items', [])
        results = []
        for event in events:
            # Handle all-day events vs timed events
            start = event['start'].get('dateTime', event['start'].get('date'))
            end = event['end'].get('dateTime', event['end'].get('date'))
            
            results.append({
                "summary": event.get('summary', 'No Title'),
                "start": start,
                "end": end,
                "id": event['id'],
                "status": event.get('status')
            })
            
        return results if results else "No events found for this period."
    except Exception as e:
        return f"Error fetching agenda: {e}"

@tool
def create_calendar_event(summary: str, start_time: str, end_time: str, description: str = "", calendar_id: str = 'primary'):
    """
    Create a new calendar event.
    
    Args:
        summary: Title of the event
        start_time: ISO format string (e.g., '2023-10-27T10:00:00-07:00')
        end_time: ISO format string
        description: Details about the event
        calendar_id: Default 'primary'
    """
    try:
        event = {
            'summary': summary,
            'description': description,
            'start': {'dateTime': start_time},
            'end': {'dateTime': end_time},
        }
        event = calendar_service.events().insert(calendarId=calendar_id, body=event).execute()
        return f"Event created: {event.get('htmlLink')}"
    except Exception as e:
        return f"Error creating event: {e}"

@tool
def update_calendar_event(event_id: str, summary: str = None, start_time: str = None, end_time: str = None, calendar_id: str = 'primary'):
    """Update an existing event. You must get the event_id from 'get_detailed_agenda' first."""
    try:
        # First retrieve the event to preserve other fields
        event = calendar_service.events().get(calendarId=calendar_id, eventId=event_id).execute()
        
        if summary:
            event['summary'] = summary
        if start_time:
            event['start']['dateTime'] = start_time
        if end_time:
            event['end']['dateTime'] = end_time
            
        updated_event = calendar_service.events().update(calendarId=calendar_id, eventId=event_id, body=event).execute()
        return f"Event updated: {updated_event.get('htmlLink')}"
    except Exception as e:
        return f"Error updating event: {e}"

@tool
def delete_calendar_event(event_id: str, calendar_id: str = 'primary'):
    """Delete an event. Use with caution."""
    try:
        calendar_service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        return "Event deleted successfully."
    except Exception as e:
        return f"Error deleting event: {e}"

# --- 3. AGENT CONFIGURATION ---

tools = [
    get_current_datetime,
    list_calendars,
    get_detailed_agenda,
    create_calendar_event,
    update_calendar_event,
    delete_calendar_event
]

system_prompt = """You are the **Calendar Agentic Manager**.
You have full scope over the user's schedule. Your goal is to manage time effectively, preventing conflicts and ensuring the schedule reflects the user's priorities.

### CORE OPERATING PROCEDURES
1.  **Temporal Awareness:** ALWAYS call `get_current_datetime` at the start of a session or when dates are ambiguous.
2.  **Safety First:** NEVER create a conflicting event without explicitly warning the user.
3.  **Discovery:** If asked to "move the meeting", first call `get_detailed_agenda` to find the meeting's ID and current time.
4.  **ISO Format:** The API requires ISO 8601 timestamps (e.g., `2024-01-30T14:00:00-05:00`). Calculate these carefully based on the user's current time.

### INTERACTION STYLE
*   Be concise but confirmation-heavy.
*   When rescheduling, state the "Before" and "After" clearly.
*   If the user asks "What's my week look like?", summarize the `get_detailed_agenda` output by grouping events by day.
"""

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", temperature=0.0)
agent = create_agent(model=llm, tools=tools, system_prompt=system_prompt, checkpointer=InMemorySaver())

# --- 4. INTERACTIVE LOOP ---

def run_chat_loop():
    print(f"\n--- Calendar Agent Online ({datetime.datetime.now().strftime('%H:%M')}) ---")
    print("Type 'q' to quit.")
    
    thread_id = "session_1"
    
    while True:
        try:
            user_input = input("\n> ")
            if user_input.lower() in ['q', 'quit', 'exit']:
                break
                
            result = agent.invoke(
                {"messages": [("user", user_input)]},
                {"configurable": {"thread_id": thread_id}}
            )
            
            # Print the final response
            last_msg = result["messages"][-1]
            print(f"\nAgent: {last_msg.content}")
            
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}")

if __name__ == "__main__":
    run_chat_loop()