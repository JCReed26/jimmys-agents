# AG-UI Protocol Contract

This is the authoritative contract for AG-UI compliance in jimmys-agents. The gateway enforces this contract on all run streams. The dashboard consumes it. Agents never need to know it exists.

**Reference:** https://docs.ag-ui.com

---

## What Is AG-UI

AG-UI (Agent-User Interaction Protocol) is an open, event-based protocol for real-time communication between AI agents and frontend applications. It travels over standard HTTP Server-Sent Events (SSE).

The gateway is the **translator**. Agents speak LangGraph. The browser speaks AG-UI. The gateway converts between them.

---

## Wire Format

All AG-UI events are SSE lines:

```
data: {json}\n\n
```

Each event is a single JSON object on one line. Fields use **camelCase**. No `event:` line prefix is required (the `type` field identifies the event).

Example stream:

```
data: {"type":"RUN_STARTED","runId":"run-abc123","threadId":"thread-xyz"}

data: {"type":"TEXT_MESSAGE_START","messageId":"msg-001","role":"assistant"}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":"Your "}

data: {"type":"TEXT_MESSAGE_CONTENT","messageId":"msg-001","delta":"budget this month..."}

data: {"type":"TEXT_MESSAGE_END","messageId":"msg-001"}

data: {"type":"RUN_FINISHED","runId":"run-abc123"}
```

---

## Event Reference

### Lifecycle Events

**RUN_STARTED** — emitted once at the start of every run.
```json
{
  "type": "RUN_STARTED",
  "runId": "string (uuid)",
  "threadId": "string"
}
```

**RUN_FINISHED** — emitted once when the agent completes normally.
```json
{
  "type": "RUN_FINISHED",
  "runId": "string"
}
```

**RUN_ERROR** — emitted when the run fails (agent crash, timeout, connection refused).
```json
{
  "type": "RUN_ERROR",
  "runId": "string",
  "message": "string (human-readable error)"
}
```

**STEP_STARTED** — emitted when a LangGraph node begins.
```json
{
  "type": "STEP_STARTED",
  "stepName": "string (node name, e.g. 'agent', 'tools')"
}
```

**STEP_FINISHED** — emitted when a LangGraph node completes.
```json
{
  "type": "STEP_FINISHED",
  "stepName": "string"
}
```

---

### Text Message Events

Streaming text output from the agent. Always comes as a triplet: START → CONTENT×N → END.

**TEXT_MESSAGE_START**
```json
{
  "type": "TEXT_MESSAGE_START",
  "messageId": "string (uuid, stable across chunks)",
  "role": "assistant"
}
```

**TEXT_MESSAGE_CONTENT**
```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "messageId": "string (same as START)",
  "delta": "string (non-empty text chunk)"
}
```

**TEXT_MESSAGE_END**
```json
{
  "type": "TEXT_MESSAGE_END",
  "messageId": "string"
}
```

---

### Tool Call Events

Every tool invocation streams as: START → ARGS×N → END → RESULT.

**TOOL_CALL_START**
```json
{
  "type": "TOOL_CALL_START",
  "toolCallId": "string (uuid)",
  "toolCallName": "string (function name, e.g. 'write_file')",
  "parentMessageId": "string (the AI message that triggered this call)"
}
```

**TOOL_CALL_ARGS** — streamed in chunks as the model generates arguments.
```json
{
  "type": "TOOL_CALL_ARGS",
  "toolCallId": "string",
  "delta": "string (partial JSON args)"
}
```

**TOOL_CALL_END**
```json
{
  "type": "TOOL_CALL_END",
  "toolCallId": "string"
}
```

**TOOL_CALL_RESULT** — emitted after the tool executes and returns.
```json
{
  "type": "TOOL_CALL_RESULT",
  "toolCallId": "string",
  "messageId": "string (the ToolMessage id)",
  "role": "tool",
  "content": "any (tool return value)"
}
```

---

### State Events (optional, for advanced use)

**STATE_SNAPSHOT** — full agent state object.
```json
{
  "type": "STATE_SNAPSHOT",
  "snapshot": {}
}
```

**STATE_DELTA** — RFC 6902 JSON Patch incremental update.
```json
{
  "type": "STATE_DELTA",
  "delta": [{"op": "add", "path": "/field", "value": "..."}]
}
```

---

### Custom Events (deepagent extensions)

Deepagent-specific operations that don't map to base AG-UI can use CustomEvent. The dashboard can render or ignore these based on type.

```json
{
  "type": "CUSTOM",
  "name": "deepagent/todo_update",
  "value": {"task": "Sync CSV", "status": "done"}
}
```

```json
{
  "type": "CUSTOM",
  "name": "deepagent/summarization",
  "value": {"compressed_messages": 12, "new_summary_tokens": 340}
}
```

```json
{
  "type": "CUSTOM",
  "name": "deepagent/skill_read",
  "value": {"skill": "build-budget"}
}
```

---

## LangGraph → AG-UI Translation

The gateway translates `stream_mode=["messages"]` output from LangGraph into AG-UI events. This is the only translation in the system — agents never change.

### Request to LangGraph (gateway → agent)

The gateway adds `stream_mode: ["messages"]` to every request forwarded to an agent:

```json
POST {agent_url}/runs/stream
{
  "assistant_id": "agent",
  "input": {
    "messages": [{"role": "human", "content": "..."}]
  },
  "config": {
    "configurable": {
      "thread_id": "thread-abc123"
    }
  },
  "stream_mode": ["messages"]
}
```

### LangGraph SSE Event Format

With `stream_mode=["messages"]`, LangGraph emits:

```
event: messages/partial
data: [{"type": "AIMessageChunk", "content": "Hello", "id": "msg-001", "tool_calls": [], "response_metadata": {}}, ...]
```

Or for tool messages:
```
event: messages/partial
data: [{"type": "ToolMessage", "content": "file written", "tool_call_id": "tc-001", "id": "tmsg-001"}]
```

### Translation Table

| LangGraph message/event | AG-UI output |
|---|---|
| Stream connects | `RUN_STARTED {runId, threadId}` |
| LangGraph node begins (from metadata) | `STEP_STARTED {stepName}` |
| `AIMessageChunk` with content, first chunk | `TEXT_MESSAGE_START {messageId, role:"assistant"}` |
| `AIMessageChunk` with content | `TEXT_MESSAGE_CONTENT {messageId, delta}` |
| `AIMessageChunk` with `tool_calls[].name` (new call) | `TOOL_CALL_START {toolCallId, toolCallName, parentMessageId}` |
| `AIMessageChunk` with `tool_calls[].args` fragment | `TOOL_CALL_ARGS {toolCallId, delta}` |
| `AIMessageChunk` last chunk for this message | `TEXT_MESSAGE_END {messageId}` + `TOOL_CALL_END×N` |
| `ToolMessage` received | `TOOL_CALL_RESULT {toolCallId, messageId, content}` |
| LangGraph node ends (from metadata) | `STEP_FINISHED {stepName}` |
| Stream closes normally | `RUN_FINISHED {runId}` |
| Connection error / timeout | `RUN_ERROR {runId, message}` |

### ID Continuity

- `messageId` maps to `AIMessageChunk.id` — stable across all chunks of the same message
- `toolCallId` maps to `AIMessageChunk.tool_calls[i].id`
- The gateway must buffer tool call IDs to emit `TOOL_CALL_END` correctly

### Usage Metadata Extraction

The final `AIMessage` (non-chunk) in the stream includes `usage_metadata`:
```json
{"input_tokens": 1234, "output_tokens": 456, "total_tokens": 1690}
```

The gateway extracts this at stream close and writes it to the run_record + HOTL entry. This enables cost tracking.

---

## Run Request Format (frontend → gateway)

The dashboard sends AG-UI run requests to the gateway. The gateway accepts this format and translates internally.

```
POST /agents/{name}/run
Content-Type: application/json
Accept: text/event-stream
```

```json
{
  "thread_id": "thread-abc123",
  "messages": [
    {"role": "user", "content": "What's my budget looking like?"}
  ]
}
```

The gateway handles `assistant_id`, `config`, `stream_mode` injection before forwarding to the agent. The frontend never sends LangGraph-specific fields.

---

## Error Handling

Errors that occur **before** streaming starts return standard HTTP error codes:

| Code | Reason |
|---|---|
| 404 | Agent not registered or disabled |
| 429 | Rate limit exceeded (`Retry-After` header included) |
| 503 | Circuit breaker OPEN — agent has been failing |

Errors that occur **during** streaming emit a `RUN_ERROR` event and close the stream:

```
data: {"type":"RUN_ERROR","runId":"run-xyz","message":"Connection refused to :8003"}
```

Stream timeout (5 minutes default) also emits `RUN_ERROR`:
```
data: {"type":"RUN_ERROR","runId":"run-xyz","message":"Stream timeout after 300s"}
```

---

## HOTL Extraction Contract

The gateway automatically builds a HOTL summary from every completed AG-UI run stream. Agents do not call `/hotl`. The extraction logic:

1. Collect all `TOOL_CALL_START` events → tools list (name, parent message)
2. Collect all `TOOL_CALL_RESULT` events → match results to calls
3. Collect final `TEXT_MESSAGE_*` sequence → overview text (first AI message content)
4. Extract `usage_metadata` from stream → token counts
5. On `RUN_FINISHED`: write HOTL entry with `{tools, overview, usage}`

Tools from deepagent file operations (`write_file`, `read_file`, `edit_file`, `list_directory`) appear in HOTL automatically because they are standard tool calls in LangGraph.

---

## Frontend Consumption

The frontend hook `use-ag-ui-stream.ts` (or `use-agent-chat.ts` once updated) subscribes to the AG-UI stream and handles:

- `RUN_STARTED` → set `runStatus: "running"`, show spinner
- `TEXT_MESSAGE_START` → create message entry
- `TEXT_MESSAGE_CONTENT` → append delta to message
- `TEXT_MESSAGE_END` → mark message complete
- `TOOL_CALL_START` → create tool call entry in thinking panel
- `TOOL_CALL_ARGS` → stream args into tool call
- `TOOL_CALL_RESULT` → show result
- `STEP_STARTED/FINISHED` → animate step nodes in workflow view
- `RUN_FINISHED` → update run status, show cost summary
- `RUN_ERROR` → show error state

All traffic to agents goes through `POST /agents/{name}/run` (gateway). Direct agent port access from the frontend is not permitted in production.
