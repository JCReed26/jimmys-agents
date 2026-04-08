import datetime
import sys
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from langchain_core.tools import tool
from backend.models import gemini_flash_model as llm
from backend.auth import get_google_service
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend

_AGENT_NAME = "calendar-agent"

_SECRETS = Path(__file__).parent.parent.parent / "secrets"
_SCOPES = ["https://www.googleapis.com/auth/calendar"]
_NOT_CONNECTED = "Calendar not connected — add calendar_token.json to secrets/ and restart."

SYSTEM_PROMPT = """You are a Calendar Management Agent with full control over the user's schedule.

Operating rules:
1. ALWAYS call get_current_datetime first when dates are ambiguous.
2. NEVER create a conflicting event without warning the user.
3. Before moving or updating an event, call get_detailed_agenda to find its ID.
4. All times must be ISO 8601 format (e.g. 2024-01-30T14:00:00-05:00).

When asked "what's my week look like?", summarize get_detailed_agenda output grouped by day."""

try:
    calendar_service = get_google_service(
        scopes=_SCOPES,
        token_path=str(_SECRETS / "calendar_token.json"),
        credentials_path=str(_SECRETS / "credentials.json"),
        service_name="calendar",
        service_version="v3",
    )
    print(f"[{_AGENT_NAME}] Google Calendar connected.")
except Exception as e:
    print(f"[{_AGENT_NAME}] Calendar auth not found ({e}). Starting in disconnected mode.")
    calendar_service = None


@tool
def get_current_datetime() -> dict:
    """Get the current date, time, and day of week. Call this first when dates are ambiguous."""
    now = datetime.datetime.now()
    return {
        "datetime": now.strftime("%Y-%m-%d %H:%M:%S"),
        "timezone": str(now.astimezone().tzinfo),
        "day_of_week": now.strftime("%A"),
    }


@tool
def list_calendars() -> list | str:
    """List all calendars the user has access to."""
    if calendar_service is None:
        return _NOT_CONNECTED
    try:
        result = calendar_service.calendarList().list().execute()
        return [
            {"id": c["id"], "summary": c.get("summary", "No Title"), "primary": c.get("primary", False)}
            for c in result.get("items", [])
        ]
    except Exception as e:
        return f"Error listing calendars: {e}"


@tool
def get_detailed_agenda(days: int = 7, calendar_id: str = "primary") -> list | str:
    """Get a list of events for the next N days. Use this before scheduling to check for conflicts.

    Args:
        days: Number of days to look ahead (default 7)
        calendar_id: Calendar to check (default 'primary')
    """
    if calendar_service is None:
        return _NOT_CONNECTED
    try:
        now = datetime.datetime.now().astimezone()
        end = now + timedelta(days=days)
        events_result = calendar_service.events().list(
            calendarId=calendar_id,
            timeMin=now.isoformat(),
            timeMax=end.isoformat(),
            singleEvents=True,
            orderBy="startTime",
        ).execute()
        events = events_result.get("items", [])
        return [
            {
                "summary": e.get("summary", "No Title"),
                "start": e["start"].get("dateTime", e["start"].get("date")),
                "end": e["end"].get("dateTime", e["end"].get("date")),
                "id": e["id"],
                "status": e.get("status"),
            }
            for e in events
        ] or "No events found for this period."
    except Exception as e:
        return f"Error fetching agenda: {e}"


@tool
def create_calendar_event(
    summary: str,
    start_time: str,
    end_time: str,
    description: str = "",
    calendar_id: str = "primary",
) -> str:
    """Create a new calendar event.

    Args:
        summary: Title of the event
        start_time: ISO 8601 string (e.g. '2024-01-30T10:00:00-05:00')
        end_time: ISO 8601 string
        description: Optional details
        calendar_id: Default 'primary'
    """
    if calendar_service is None:
        return _NOT_CONNECTED
    try:
        event = calendar_service.events().insert(
            calendarId=calendar_id,
            body={
                "summary": summary,
                "description": description,
                "start": {"dateTime": start_time},
                "end": {"dateTime": end_time},
            },
        ).execute()
        return f"Event created: {event.get('htmlLink')}"
    except Exception as e:
        return f"Error creating event: {e}"


@tool
def update_calendar_event(
    event_id: str,
    summary: str = "",
    start_time: str = "",
    end_time: str = "",
    calendar_id: str = "primary",
) -> str:
    """Update an existing calendar event. Get event_id from get_detailed_agenda first.

    Args:
        event_id: The event ID to update
        summary: New title (leave empty to keep existing)
        start_time: New ISO 8601 start time (leave empty to keep existing)
        end_time: New ISO 8601 end time (leave empty to keep existing)
        calendar_id: Default 'primary'
    """
    if calendar_service is None:
        return _NOT_CONNECTED
    try:
        event = calendar_service.events().get(calendarId=calendar_id, eventId=event_id).execute()
        if summary:
            event["summary"] = summary
        if start_time:
            event["start"]["dateTime"] = start_time
        if end_time:
            event["end"]["dateTime"] = end_time
        updated = calendar_service.events().update(calendarId=calendar_id, eventId=event_id, body=event).execute()
        return f"Event updated: {updated.get('htmlLink')}"
    except Exception as e:
        return f"Error updating event: {e}"


@tool
def delete_calendar_event(event_id: str, calendar_id: str = "primary") -> str:
    """Delete a calendar event. Use with caution — this cannot be undone.

    Args:
        event_id: The event ID to delete (get it from get_detailed_agenda)
        calendar_id: Default 'primary'
    """
    if calendar_service is None:
        return _NOT_CONNECTED
    try:
        calendar_service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        return "Event deleted successfully."
    except Exception as e:
        return f"Error deleting event: {e}"


tools = [
    get_current_datetime,
    list_calendars,
    get_detailed_agenda,
    create_calendar_event,
    update_calendar_event,
    delete_calendar_event,
]

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
