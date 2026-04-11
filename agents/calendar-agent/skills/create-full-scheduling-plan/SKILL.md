---
name: create-full-scheduling-plan
description: Use to intelligently map Todoist tasks or A2A payloads to available calendar time slots.
---
# Skill: Create Full Scheduling Plan

**Purpose:** Synthesizes calendar availability and pending tasks into a cohesive schedule.

**Instructions:**
1. Retrieve any incoming meeting requests using `read_workspace_payload` and gather pending Todoist tasks using the tools provided by the Todoist MCP server.
2. Use `search_events` to identify blocks of free time in the user's primary calendar.
3. Match the Todoist tasks or requested meetings to these free blocks.
4. When planning, strictly adhere to constraints in `AGENTS.md` (e.g. default 30-minute blocks, 15-minute buffers).
5. Only after formulating the plan internally should you proceed to call `create_calendar_event` or any Todoist creation tools to solidify the schedule.