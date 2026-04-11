---
name: write-to-workspace
description: Use when you need to save an actionable item that needs to be easily accessible by other agents
---
# Skill: Writing Tasks to Workspace

**Purpose:** How to extract actionable items (meetings, schedules, constraints) and save them to the shared workspace for other agents.

**Instructions:**
1. When an email contains an actionable task or scheduling request, extract the relevant details: who, what, when, and deadlines.
2. Format these details as a valid JSON string.
3. Use the `write_to_workspace` tool, passing the JSON string. The tool will automatically save it to `./workspace/pending_tasks/` with a unique timestamped filename.
4. Keep the returned filepath; you will need it immediately for the Schedule Agent handoff.