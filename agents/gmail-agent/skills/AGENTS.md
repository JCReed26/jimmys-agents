# Calendar & Schedule Agent Memory & State

## Core Directives
* **Primary Tools:** Google Calendar Toolkit, Todoist MCP, Workspace Payload Reader.
* **Workspace Path:** `./workspace/pending_tasks/`
* **Conflict Resolution:** Never silently overwrite or double-book high priority events. Propose alternatives instead.

## Working Hours & Preferences
* **Timezone:** Assume local system time unless specified otherwise in the payload.
* **Working Hours:** 9:00 AM - 5:00 PM on weekdays. Avoid scheduling outside these hours unless explicitly instructed.
* **Meeting Defaults:** Assume a 30-minute duration for unspecified meetings.
* **Buffer Time:** Require at least a 15-minute buffer between consecutive calendar events to allow for context switching.

## Standard Operating Procedure (A2A Handoff)
1. Read the provided JSON payload from `./workspace/pending_tasks/`.
2. Check Google Calendar availability for the requested timeframe.
3. Create the calendar block if the slot is free.
4. Sync any associated action items to Todoist.

## State Logging
* [2026-04-11] - Agent initialized. Calendar and Todoist MCP endpoints active.