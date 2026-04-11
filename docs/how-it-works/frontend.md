# Frontend: How It Works

## Chat Library
`useStream` from `@langchain/langgraph-sdk/react` (already installed — no separate package).

```typescript
import { useStream } from "@langchain/langgraph-sdk/react";

const stream = useStream<AgentState>({
  apiUrl: getAgentUrl(cfg),        // local or LangSmith URL
  assistantId: cfg.graphId,        // "agent" for all agents
  threadId,                        // null = new thread on submit; string = load existing
  reconnectOnMount: true,
  fetchStateHistory: true,
  filterSubagentMessages: true,    // typed as `as any` — works at runtime, untyped for generic agents
  onThreadId: (id) => setThreadId(id),  // fires when new thread is created
} as any);
```

## Key Properties
| Property | Type | Description |
|---|---|---|
| `stream.values.messages` | array | Chat history |
| `stream.values.todos` | array | `[{content, status}]` from TodoListMiddleware |
| `stream.isLoading` | boolean | True while agent runs |
| `stream.getSubagentsByMessage(id)` | array | Subagent streams — cast `as unknown as SubagentStream[]` |

## Submitting
```typescript
stream.submit(
  { messages: [{ type: "human", content: text }] },
  { streamSubgraphs: true, config: { recursion_limit: 10000 } }
);
```
`streamSubgraphs: true` required for SubagentCard streaming.

## Thread Management
- `threadId = null` → useStream creates a new thread on first submit, fires `onThreadId`
- `threadId = "uuid"` → loads existing thread history
- Thread list from `client.threads.search({ limit: 30, sortBy: "updated_at" })`

## URL Routing (Local vs Cloud)
`getAgentUrl(cfg)` in `src/lib/agents.ts`:
- `cfg.langsmithUrl` set → use LangSmith cloud URL
- else → use `cfg.url` (localhost)

Set `NEXT_PUBLIC_{AGENT}_LANGSMITH_URL` in `frontend/.env.local` to switch.

## Adding a New Agent Page
Add entry to `src/lib/agents.ts` — `/agent/[name]` is dynamic, no new file needed.
