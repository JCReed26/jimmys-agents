import os
import datetime
from datetime import timedelta
from typing import List, Dict, Optional
from dotenv import load_dotenv, find_dotenv
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from backend.auth import get_google_service
from backend.metrics_callback import MetricsCallback

# LangChain Imports
from langchain.agents import create_agent
from langchain.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import InMemorySaver

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

# --- 1. AUTHENTICATION & SETUP ---

SCOPES = ["https://www.googleapis.com/auth/calendar"]

_NOT_CONNECTED = "Calendar not connected. Click 'Connect' in the dashboard, then restart this agent."

calendar_service = None
try:
    calendar_service = get_google_service(
        scopes=SCOPES,
        token_path=os.environ.get("CALENDAR_TOKEN_PATH", "../secrets/calendar_token.json"),
        credentials_path=os.environ.get("CREDENTIALS_PATH", "../secrets/credentials.json"),
        service_name="calendar",
        service_version="v3",
    )
    print("Successfully connected to Google Calendar API")
except Exception as e:
    print(f"Calendar not authenticated ({e}). Starting in disconnected mode.")

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
    if calendar_service is None:
        return _NOT_CONNECTED
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
    if calendar_service is None:
        return _NOT_CONNECTED
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
    if calendar_service is None:
        return _NOT_CONNECTED
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
    if calendar_service is None:
        return _NOT_CONNECTED
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
    if calendar_service is None:
        return _NOT_CONNECTED
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
# agent = create_agent(model=llm, tools=tools, system_prompt=system_prompt, checkpointer=InMemorySaver())
# For LangGraph API (langgraph dev), we must NOT pass a checkpointer
print(f"DEBUG: Initializing agent with tools: {[t.name for t in tools]}")
agent = create_agent(model=llm, tools=tools, system_prompt=system_prompt)
print("DEBUG: Agent initialized successfully")
metrics_cb = MetricsCallback(agent_name="calendar-agent")

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
                {"configurable": {"thread_id": thread_id}, "callbacks": [metrics_cb]}
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