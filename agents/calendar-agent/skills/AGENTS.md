# Schedule Agent Memory & State

## Core Directives
* **Primary Tools:** LangChain Google Calendar Toolkit (`create_calendar_event`, `search_events`, `get_current_datetime`, etc.) and the Todoist MCP Server.
* **Workspace Path:** `./workspace/pending_tasks/`

## Learned Preferences
* Default meeting duration should be assumed as 30 minutes unless otherwise specified in the incoming payload.
* Require at least a 15-minute buffer between consecutive calendar events.
* Always verify timezone consistency using `get_current_datetime` before performing time-sensitive searches or creations.

## State Logging
* [2026-04-11] - Agent initialized. Replaced custom CRUD tools with LangChain Google Calendar Toolkit and integrated Todoist via remote SSE MCP.