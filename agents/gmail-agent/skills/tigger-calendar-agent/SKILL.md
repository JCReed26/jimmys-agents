---
name: trigger-calendar-agent
description: Use after adding a task to the workspace for the calendar agent
---
# Skill: Triggering Schedule Agent (A2A Handoff)

**Purpose:** How to hand off a parsed scheduling task to the Calendar/Schedule Agent.

**Instructions:**
1. Immediately after successfully using the `write_to_workspace` tool, you must hand off the task.
2. Use the `trigger_schedule_agent` tool.
3. Pass the exact filepath returned by `write_to_workspace` as the argument to the tool.
4. Once triggered successfully, note the completion in your ongoing memory so you do not process the same task twice.
