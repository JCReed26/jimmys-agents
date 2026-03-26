# Gmail Agent — Rules

_Behavioral rules. Agent-managed: update by appending rules during runs._

## Classification Rules
- Emails from recruiters: classify as `job_lead`, flag for HITL review
- Newsletters: classify as `newsletter`, archive immediately
- Bills / invoices: classify as `financial`, forward summary to budget-agent
- Personal emails: classify as `personal`, leave in inbox

## HITL Policy
- Always request approval before sending replies
- Always request approval before archiving emails not matching a clear rule

## Defaults
- Temperature: 0 (deterministic)
- Poll interval: configurable via dashboard (default 30 min)
