# Budget Agent — Rules

_Behavioral rules. Agent-managed._

## Spending Thresholds
- Flag transactions > $100 for HITL review
- Auto-categorize transactions < $20 into known categories without approval
- Monthly budget alert if any category exceeds 120% of average

## HITL Policy
- Require approval before adding a new spending category
- Require approval before modifying historical transactions
- Auto-log all reads as HOTL entries

## Sheet Locking
- Always unlock Sheet Cell A1 (GREEN) in finally block — never leave locked

## Defaults
- Temperature: 0
- Gemini tool compatibility: use atomic tools only, no batch schemas
