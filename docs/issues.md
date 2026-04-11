# Open Issues

> Update when bugs are found or fixed.

## Open
_None currently._

## Resolved
- **CopilotKit 2-min build times** — removed April 2026, replaced with `useStream`
- **LangSmith traces not appearing** — fixed by adding `"env": "../../.env"` to all `langgraph.json` files
- **Health check 404** — fixed endpoint from `/runs/stream/health` to `/ok`
- **Dashboard recompile storm** — fixed by removing lucide icon imports from API route + polling 30s instead of 8s
- **useStream 404 on new thread** — fixed by initializing `threadId = null` instead of pre-generating UUID
