---
name: check-calendar-availability
description: Use before creating any calendar blocks to ensure the user is free during the requested time.
---
# Skill: Check Calendar Availability

**Purpose:** Prevents scheduling conflicts by verifying Google Calendar slots using native toolkit search.

**Instructions:**
1. Determine the start and end time of the proposed block.
2. If the current date is ambiguous, use the `get_current_datetime` tool to orient yourself.
3. Call the `search_events` tool with a specific time range to see if any events already exist in that window.
4. If an event is returned during that time block, find an alternative proposed time or task arrangement.
5. NEVER schedule a new event without verifying availability first using `search_events`.