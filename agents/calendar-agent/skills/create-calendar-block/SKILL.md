---
name: create-calendar-block
description: Use to insert a new event or time block into the user's Google Calendar.
---
# Skill: Create Calendar Block

**Purpose:** Executes the actual insertion of an event into the calendar after availability has been confirmed.

**Instructions:**
1. Ensure you have checked availability using the `check-calendar-availability` skill.
2. Use the `create_calendar_event` tool with the required summary, start time, and end time.
3. Ensure timestamps are formatted exactly as the Google Calendar API expects (ISO 8601 string, e.g. '2024-01-30T10:00:00-05:00').
4. Include relevant context or links in the event description (for instance, a link back to a specific Todoist task).