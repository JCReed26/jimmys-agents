# AG-UI Harness Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken AG-UI protocol connections, add the LangGraph→AG-UI translation layer, wire gateway-owned HOTL, add missing endpoints, fix the deepagent middleware crash, and update the frontend to route all traffic through the gateway.

**Architecture:** The gateway (`backend/api_server.py`) calls `{agent_url}/runs/stream` using LangGraph's native HTTP API, translates the SSE output to AG-UI events via a new `StreamTranslator` class, and streams those AG-UI events to the browser. The translation layer is extracted into `backend/translator.py` for isolated unit testing. Gateway owns run lifecycle and HOTL for all runs (chat + scheduled).

**Tech Stack:** Python 3.13, FastAPI, httpx async streaming, asyncio.Queue pub-sub, Next.js 15 App Router, TypeScript fetch streaming, pytest

---

## Pre-conditions

- On branch `feat/ag-ui-harness-overhaul`
- Gateway runs: `make run-api-server` (starts `.venv/bin/python backend/api_server.py`)
- Budget agent runs: `make run-budget` (starts `langgraph dev --port 8003`)
- C-06 (Makefile Python) and M-07 (schedule disable) are **already fixed** — skip them
- Issue #12 CORS is already correct (`["localhost:3000"]`) — skip it

---

## File Map

| File | Change |
|---|---|
| `backend/translator.py` | **CREATE** — `StreamTranslator` class |
| `tests/test_translator.py` | **CREATE** — unit tests for translator |
| `backend/db.py` | **MODIFY** — add `thread_id` to `schedules_v2`, add `hotl_clear()`, `schedule_set_thread_id()` |
| `backend/api_server.py` | **MODIFY** — 6 targeted changes (see tasks) |
| `agents/budget-deepagent/agent.py` | **MODIFY** — fix line 61 crash, remove HOTL callback |
| `frontend/src/app/api/chat/[agent]/route.ts` | **MODIFY** — POST through gateway |
| `frontend/src/hooks/use-agent-chat.ts` | **MODIFY** — parse AG-UI events |
| `frontend/src/app/api/hotl/clear/route.ts` | **CREATE** — proxy for clear endpoint |

---

## Task 1: Create `backend/translator.py` + unit tests

**Files:**
- Create: `backend/translator.py`
- Create: `tests/test_translator.py`

### Step 1.1: Create translator.py

- [ ] Create `backend/translator.py`:

```python
"""
Translates LangGraph SSE stream (stream_mode=["messages"]) to AG-UI events.

LangGraph sends:
    event: messages/partial
    data: [{"type": "AIMessageChunk", "content": "...", "id": "...", "tool_calls": [...]}]

    event: messages/complete
    data: [{"type": "AIMessage", ..., "usage_metadata": {...}}]

    event: messages/partial
    data: [{"type": "ToolMessage", "tool_call_id": "...", "content": "..."}]

This module translates those into AG-UI SSE lines:
    data: {"type": "TEXT_MESSAGE_CONTENT", "messageId": "...", "delta": "..."}\n\n
"""
from __future__ import annotations

import json
import uuid
from typing import Iterator


class StreamTranslator:
    """
    Stateful translator: LangGraph messages → AG-UI SSE lines.

    Usage:
        t = StreamTranslator(run_id="...", thread_id="...")
        yield t.start()
        for sse_line in agent_response:
            event_type, data = parse_sse_line(sse_line)
            for ag_ui_line in t.feed(event_type, data):
                yield ag_ui_line
        for ag_ui_line in t.finish():
            yield ag_ui_line
        # After stream:
        usage = t.usage_metadata   # dict | None
        summary = t.hotl_summary   # passed to db.hotl_create()
    """

    def __init__(self, run_id: str, thread_id: str):
        self.run_id = run_id
        self.thread_id = thread_id

        self._active_msg_id: str | None = None
        self._open_tool_calls: dict[str, str] = {}  # tc_id -> tc_name

        # Accumulated for HOTL
        self._overview: str = ""
        self._tool_records: dict[str, dict] = {}  # tc_id -> {name, args, result}
        self.usage_metadata: dict | None = None

    # ──────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────

    def start(self) -> str:
        """Return RUN_STARTED SSE line."""
        return self._event("RUN_STARTED", {"runId": self.run_id, "threadId": self.thread_id})

    def feed(self, event_type: str, data: object) -> Iterator[str]:
        """
        Translate one LangGraph SSE payload to zero or more AG-UI SSE lines.
        event_type: value of the `event:` line (e.g. "messages/partial")
        data: parsed JSON from the `data:` line (list of message dicts)
        """
        if event_type not in ("messages/partial", "messages/complete"):
            return
        messages = data if isinstance(data, list) else [data]
        for msg in messages:
            yield from self._translate_message(msg)

    def finish(self) -> Iterator[str]:
        """Close any open message/tool calls, yield RUN_FINISHED."""
        if self._active_msg_id:
            yield self._event("TEXT_MESSAGE_END", {"messageId": self._active_msg_id})
            self._active_msg_id = None
        for tc_id in list(self._open_tool_calls):
            yield self._event("TOOL_CALL_END", {"toolCallId": tc_id})
        self._open_tool_calls.clear()
        yield self._event("RUN_FINISHED", {"runId": self.run_id})

    def error(self, message: str) -> str:
        """Return RUN_ERROR SSE line."""
        return self._event("RUN_ERROR", {"runId": self.run_id, "message": message})

    @property
    def hotl_summary(self) -> dict:
        return {
            "overview": self._overview[:500] if self._overview else "Run completed.",
            "tools": list(self._tool_records.values()),
            "usage": self.usage_metadata or {},
        }

    # ──────────────────────────────────────────
    # Internal
    # ──────────────────────────────────────────

    def _translate_message(self, msg: dict) -> Iterator[str]:
        msg_type = msg.get("type", "")
        msg_id = msg.get("id") or str(uuid.uuid4())

        if msg_type == "AIMessageChunk":
            yield from self._handle_ai_chunk(msg, msg_id)
        elif msg_type == "AIMessage":
            if msg.get("usage_metadata"):
                self.usage_metadata = msg["usage_metadata"]
            if self._active_msg_id:
                yield self._event("TEXT_MESSAGE_END", {"messageId": self._active_msg_id})
                self._active_msg_id = None
            for tc_id in list(self._open_tool_calls):
                yield self._event("TOOL_CALL_END", {"toolCallId": tc_id})
            self._open_tool_calls.clear()
        elif msg_type == "ToolMessage":
            yield from self._handle_tool_message(msg, msg_id)

    def _handle_ai_chunk(self, msg: dict, msg_id: str) -> Iterator[str]:
        content = msg.get("content", "")
        tool_calls_raw = msg.get("tool_calls", [])

        if msg.get("usage_metadata"):
            self.usage_metadata = msg["usage_metadata"]

        if content:
            if self._active_msg_id != msg_id:
                if self._active_msg_id is not None:
                    yield self._event("TEXT_MESSAGE_END", {"messageId": self._active_msg_id})
                self._active_msg_id = msg_id
                yield self._event("TEXT_MESSAGE_START", {"messageId": msg_id, "role": "assistant"})
                if not self._overview:
                    self._overview = content
            yield self._event("TEXT_MESSAGE_CONTENT", {"messageId": msg_id, "delta": content})

        for tc in tool_calls_raw:
            tc_id = tc.get("id") or str(uuid.uuid4())
            tc_name = tc.get("name", "")
            tc_args = tc.get("args", {})

            if tc_id not in self._open_tool_calls:
                self._open_tool_calls[tc_id] = tc_name
                self._tool_records[tc_id] = {"name": tc_name, "args": tc_args, "result": None}
                yield self._event("TOOL_CALL_START", {
                    "toolCallId": tc_id,
                    "toolCallName": tc_name,
                    "parentMessageId": msg_id,
                })
            elif tc_args:
                self._tool_records[tc_id]["args"] = tc_args

            if tc_args:
                args_str = json.dumps(tc_args) if isinstance(tc_args, dict) else str(tc_args)
                yield self._event("TOOL_CALL_ARGS", {"toolCallId": tc_id, "delta": args_str})

    def _handle_tool_message(self, msg: dict, msg_id: str) -> Iterator[str]:
        tc_id = msg.get("tool_call_id", "")
        content = msg.get("content", "")

        if tc_id in self._open_tool_calls:
            yield self._event("TOOL_CALL_END", {"toolCallId": tc_id})
            if tc_id in self._tool_records:
                self._tool_records[tc_id]["result"] = content
            del self._open_tool_calls[tc_id]

        yield self._event("TOOL_CALL_RESULT", {
            "toolCallId": tc_id,
            "messageId": msg_id,
            "role": "tool",
            "content": content,
        })

    @staticmethod
    def _event(type_: str, data: dict) -> str:
        return f'data: {json.dumps({"type": type_, **data})}\n\n'
```

### Step 1.2: Create tests/test_translator.py

- [ ] Create `tests/test_translator.py`:

```python
import json
import pytest
from backend.translator import StreamTranslator


def parse_events(lines: list[str]) -> list[dict]:
    return [json.loads(line[6:]) for line in lines if line.startswith("data: ")]


def test_start_emits_run_started():
    t = StreamTranslator("run-001", "thread-001")
    event = json.loads(t.start()[6:])
    assert event["type"] == "RUN_STARTED"
    assert event["runId"] == "run-001"
    assert event["threadId"] == "thread-001"


def test_simple_text_message():
    t = StreamTranslator("run-001", "thread-001")
    chunks = [
        {"type": "AIMessageChunk", "id": "msg-1", "content": "Hello ", "tool_calls": []},
        {"type": "AIMessageChunk", "id": "msg-1", "content": "world", "tool_calls": []},
        {"type": "AIMessage", "id": "msg-1", "content": "Hello world", "tool_calls": []},
    ]
    events = []
    for chunk in chunks:
        events.extend(parse_events(list(t.feed("messages/partial", [chunk]))))
    events.extend(parse_events(list(t.finish())))

    types = [e["type"] for e in events]
    assert types == [
        "TEXT_MESSAGE_START",
        "TEXT_MESSAGE_CONTENT",
        "TEXT_MESSAGE_CONTENT",
        # TEXT_MESSAGE_END comes from AIMessage closing it
        "TEXT_MESSAGE_END",
        "RUN_FINISHED",
    ]
    deltas = [e.get("delta") for e in events if e["type"] == "TEXT_MESSAGE_CONTENT"]
    assert deltas == ["Hello ", "world"]


def test_tool_call_flow():
    t = StreamTranslator("run-001", "thread-001")
    chunks = [
        {
            "type": "AIMessageChunk",
            "id": "msg-1",
            "content": "",
            "tool_calls": [{"id": "tc-1", "name": "write_file", "args": {"path": "data/test.csv"}}],
        },
        {
            "type": "ToolMessage",
            "id": "tmsg-1",
            "tool_call_id": "tc-1",
            "content": "Written successfully",
        },
        {"type": "AIMessage", "id": "msg-2", "content": "Done", "tool_calls": []},
    ]
    events = []
    for chunk in chunks:
        events.extend(parse_events(list(t.feed("messages/partial", [chunk]))))
    events.extend(parse_events(list(t.finish())))

    types = [e["type"] for e in events]
    assert "TOOL_CALL_START" in types
    assert "TOOL_CALL_ARGS" in types
    assert "TOOL_CALL_END" in types
    assert "TOOL_CALL_RESULT" in types

    tc_start = next(e for e in events if e["type"] == "TOOL_CALL_START")
    assert tc_start["toolCallName"] == "write_file"
    assert tc_start["toolCallId"] == "tc-1"

    tc_result = next(e for e in events if e["type"] == "TOOL_CALL_RESULT")
    assert tc_result["content"] == "Written successfully"


def test_usage_metadata_extracted():
    t = StreamTranslator("run-001", "thread-001")
    final_msg = {
        "type": "AIMessage",
        "id": "msg-1",
        "content": "Done",
        "tool_calls": [],
        "usage_metadata": {"input_tokens": 100, "output_tokens": 50},
    }
    list(t.feed("messages/complete", [final_msg]))
    assert t.usage_metadata == {"input_tokens": 100, "output_tokens": 50}


def test_hotl_summary_populated():
    t = StreamTranslator("run-001", "thread-001")
    chunks = [
        {"type": "AIMessageChunk", "id": "msg-1", "content": "Budget looks good.", "tool_calls": []},
        {
            "type": "AIMessageChunk",
            "id": "msg-1",
            "content": "",
            "tool_calls": [{"id": "tc-1", "name": "read_file", "args": {"path": "data/Expenses.csv"}}],
        },
        {"type": "ToolMessage", "id": "tmsg-1", "tool_call_id": "tc-1", "content": "...csv data..."},
        {
            "type": "AIMessage",
            "id": "msg-1",
            "content": "Budget looks good.",
            "tool_calls": [],
            "usage_metadata": {"input_tokens": 200, "output_tokens": 80},
        },
    ]
    for chunk in chunks:
        list(t.feed("messages/partial", [chunk]))

    summary = t.hotl_summary
    assert summary["overview"] == "Budget looks good."
    assert len(summary["tools"]) == 1
    assert summary["tools"][0]["name"] == "read_file"
    assert summary["usage"]["input_tokens"] == 200


def test_finish_closes_unclosed_message():
    t = StreamTranslator("run-001", "thread-001")
    list(t.feed("messages/partial", [{"type": "AIMessageChunk", "id": "msg-1", "content": "Hello", "tool_calls": []}]))
    events = parse_events(list(t.finish()))
    types = [e["type"] for e in events]
    assert "TEXT_MESSAGE_END" in types
    assert "RUN_FINISHED" in types


def test_non_message_events_ignored():
    t = StreamTranslator("run-001", "thread-001")
    events = list(t.feed("updates", {"agent": {"messages": []}}))
    assert events == []


def test_error_event():
    t = StreamTranslator("run-001", "thread-001")
    event = json.loads(t.error("Connection refused")[6:])
    assert event["type"] == "RUN_ERROR"
    assert event["message"] == "Connection refused"
    assert event["runId"] == "run-001"


def test_multiple_tool_calls_in_run():
    t = StreamTranslator("run-001", "thread-001")
    chunks = [
        {"type": "AIMessageChunk", "id": "msg-1", "content": "", "tool_calls": [
            {"id": "tc-1", "name": "read_file", "args": {"path": "a.csv"}},
        ]},
        {"type": "ToolMessage", "id": "tm-1", "tool_call_id": "tc-1", "content": "data1"},
        {"type": "AIMessageChunk", "id": "msg-2", "content": "", "tool_calls": [
            {"id": "tc-2", "name": "write_file", "args": {"path": "b.csv", "content": "x"}},
        ]},
        {"type": "ToolMessage", "id": "tm-2", "tool_call_id": "tc-2", "content": "ok"},
        {"type": "AIMessage", "id": "msg-3", "content": "Done", "tool_calls": []},
    ]
    events = []
    for chunk in chunks:
        events.extend(parse_events(list(t.feed("messages/partial", [chunk]))))
    events.extend(parse_events(list(t.finish())))

    tool_starts = [e for e in events if e["type"] == "TOOL_CALL_START"]
    tool_ends = [e for e in events if e["type"] == "TOOL_CALL_END"]
    assert len(tool_starts) == 2
    assert len(tool_ends) == 2
    assert t.hotl_summary["tools"][0]["name"] == "read_file"
    assert t.hotl_summary["tools"][1]["name"] == "write_file"
```

### Step 1.3: Run tests to verify they pass

- [ ] Run:

```bash
cd /Users/jcreed/Documents/GitHub/jimmys-agents
.venv/bin/pytest tests/test_translator.py -v
```

Expected: All 9 tests **PASS**.

### Step 1.4: Commit

```bash
git add backend/translator.py tests/test_translator.py
git commit -m "feat: add StreamTranslator for LangGraph→AG-UI event translation"
```

---

## Task 2: Migrate `backend/db.py` — add thread_id, hotl_clear

**Files:**
- Modify: `backend/db.py`

### Step 2.1: Add `thread_id` column migration to `schedules_v2`

The `schedules_v2` table (line 59–69 of `db.py`) needs a `thread_id` column. Since the table already exists in production, we use `ALTER TABLE` in the `migrate()` function.

- [ ] In `backend/db.py`, inside `migrate()`, after the `executescript` block and before the old-table migration, add:

```python
        # Add thread_id to schedules_v2 if missing (safe to run multiple times)
        cols = [r[1] for r in conn.execute("PRAGMA table_info(schedules_v2)").fetchall()]
        if "thread_id" not in cols:
            conn.execute("ALTER TABLE schedules_v2 ADD COLUMN thread_id TEXT")
```

Place this block at line ~85 (after `conn.executescript(...)` closes and before `old_tables = ...`).

### Step 2.2: Add `hotl_clear()` function

- [ ] In `backend/db.py`, after `hotl_mark_read()` (around line 181), add:

```python
def hotl_clear(agent: str | None = None) -> int:
    """Delete all HOTL logs. Returns count deleted."""
    with _conn() as conn:
        if agent:
            count = conn.execute("SELECT COUNT(*) FROM hotl_logs WHERE agent=?", (agent,)).fetchone()[0]
            conn.execute("DELETE FROM hotl_logs WHERE agent=?", (agent,))
        else:
            count = conn.execute("SELECT COUNT(*) FROM hotl_logs").fetchone()[0]
            conn.execute("DELETE FROM hotl_logs")
        return count
```

### Step 2.3: Add `schedule_set_thread_id()` function

- [ ] In `backend/db.py`, after `schedule_get()` (around line 245), add:

```python
def schedule_set_thread_id(agent: str, workflow: str, thread_id: str):
    """Persist the thread_id used for a scheduled run so history is continuous."""
    with _conn() as conn:
        conn.execute(
            "UPDATE schedules_v2 SET thread_id=? WHERE agent=? AND workflow=?",
            (thread_id, agent, workflow),
        )
```

### Step 2.4: Verify migration runs without error

- [ ] Run:

```bash
cd /Users/jcreed/Documents/GitHub/jimmys-agents
.venv/bin/python -c "from backend import db; print('migrate ok'); print(db.schedule_list())"
```

Expected: Prints `migrate ok` and a list (may be empty). No errors.

### Step 2.5: Commit

```bash
git add backend/db.py
git commit -m "feat(db): add schedules thread_id, hotl_clear, schedule_set_thread_id"
```

---

## Task 3: Rewrite `_proxy_sse` in `api_server.py` — C-01 AG-UI translation

**Files:**
- Modify: `backend/api_server.py`

This replaces the "dumb passthrough" in `_proxy_sse` (lines 207–257) with translator-driven streaming.

### Step 3.1: Add translator import

- [ ] In `backend/api_server.py`, after line 35 (`from backend.agent_registry import registry`), add:

```python
from backend.translator import StreamTranslator
```

### Step 3.2: Add `_estimate_cost()` helper

- [ ] After the `_rate_buckets` dict (around line 291), add:

```python
def _estimate_cost(total_tokens: int) -> float:
    """Rough Gemini 2.5 Flash cost estimate (~$0.50/1M tokens average)."""
    return round(total_tokens * 0.0000005, 6)
```

### Step 3.3: Replace `_proxy_sse` with translator version

- [ ] Replace the entire `_proxy_sse` function (lines 207–257) with:

```python
async def _proxy_sse(agent_name: str, request: Request) -> AsyncIterator[str]:
    """
    Call {agent_url}/runs/stream (LangGraph native SSE),
    translate to AG-UI events, stream to browser.
    Writes run_record and HOTL on completion.
    """
    run_id = str(uuid.uuid4())
    db.run_start(agent_name, run_id)

    # Parse AG-UI request body
    try:
        body_bytes = await request.body()
        req_data = json.loads(body_bytes) if body_bytes else {}
    except Exception:
        req_data = {}

    thread_id = req_data.get("thread_id") or str(uuid.uuid4())
    messages = req_data.get("messages", [])

    # Build LangGraph payload
    lg_payload = {
        "assistant_id": "agent",
        "input": {"messages": messages},
        "config": {"configurable": {"thread_id": thread_id}},
        "stream_mode": ["messages"],
    }

    translator = StreamTranslator(run_id=run_id, thread_id=thread_id)
    yield translator.start()

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{registry.base_url(agent_name)}/runs/stream",
                json=lg_payload,
                headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            ) as resp:
                resp.raise_for_status()
                registry.record_success(agent_name)

                current_event_type = "messages/partial"
                async for line in resp.aiter_lines():
                    if await request.is_disconnected():
                        break
                    if line.startswith("event: "):
                        current_event_type = line[7:].strip()
                    elif line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        for ag_ui_line in translator.feed(current_event_type, data):
                            yield ag_ui_line

        for ag_ui_line in translator.finish():
            yield ag_ui_line

        usage = translator.usage_metadata or {}
        token_count = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        cost_usd = _estimate_cost(token_count)
        db.run_finish(run_id, "done", token_count=token_count, cost_usd=cost_usd)
        db.hotl_create(agent_name, run_id, translator.hotl_summary)

    except httpx.HTTPStatusError as e:
        registry.record_failure(agent_name)
        db.run_finish(run_id, "error", error_msg=str(e))
        yield translator.error(f"Agent returned HTTP {e.response.status_code}")

    except Exception as e:
        registry.record_failure(agent_name)
        db.run_finish(run_id, "error", error_msg=str(e))
        yield translator.error(str(e))
```

### Step 3.4: Remove old `event:` prefix from error lines

- [ ] The old code used `f"event: RUN_ERROR\ndata: ..."`. The new translator.error() returns `data: {...}\n\n` — check that both exception handlers now use `yield translator.error(...)`. The replacement in Step 3.3 already does this.

### Step 3.5: Smoke test — curl the gateway

Start the gateway and a budget agent first:
```bash
make run-budget &   # wait 5s for it to start
make run-api-server &  # wait 3s
```

- [ ] Run:

```bash
curl -N -s -X POST http://localhost:8080/agents/budget-agent/run \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"thread_id":"test-001","messages":[{"role":"user","content":"Hello"}]}' \
  | head -20
```

Expected output: Lines starting with `data: {"type":"RUN_STARTED"...`, `data: {"type":"TEXT_MESSAGE_START"...`, etc.

### Step 3.6: Commit

```bash
git add backend/api_server.py
git commit -m "feat(gateway): replace passthrough with LangGraph→AG-UI translation layer (C-01)"
```

---

## Task 4: Fix `trigger_agent_run` + add live stream pub-sub — C-02

**Files:**
- Modify: `backend/api_server.py`

### Step 4.1: Add live stream queue dict

- [ ] In `backend/api_server.py`, after the `_rate_buckets` dict (around line 291), add:

```python
# In-memory pub-sub for scheduled run live stream: {agent_name: asyncio.Queue}
_live_queues: dict[str, asyncio.Queue] = {}


def _get_live_queue(agent: str) -> asyncio.Queue:
    if agent not in _live_queues:
        _live_queues[agent] = asyncio.Queue(maxsize=500)
    return _live_queues[agent]


def _publish_live(agent: str, event_line: str) -> None:
    """Non-blocking put to live queue. Silently drops if full."""
    q = _get_live_queue(agent)
    try:
        q.put_nowait(event_line)
    except asyncio.QueueFull:
        pass
```

### Step 4.2: Replace `trigger_agent_run` with streaming version

- [ ] Replace the entire `trigger_agent_run` function (lines 52–73) with:

```python
async def trigger_agent_run(agent: str, workflow: str = "default", task_prompt: str | None = None):
    """
    Fire a LangGraph /runs/stream call for scheduled runs.
    Translates to AG-UI, publishes to live queue, writes HOTL on completion.
    """
    run_id = str(uuid.uuid4())
    db.run_start(agent, run_id)

    agent_cfg = registry.get(agent)
    if not agent_cfg or not agent_cfg.enabled:
        db.run_finish(run_id, "error", error_msg="Agent not registered or disabled")
        return

    # Get or create a stable thread_id for this schedule
    sched = db.schedule_get(agent, workflow)
    thread_id = (sched.get("thread_id") if sched else None) or f"thread-schedule-{agent}-{workflow}"
    if sched and not sched.get("thread_id"):
        db.schedule_set_thread_id(agent, workflow, thread_id)

    prompt = task_prompt or "Run your scheduled task."
    lg_payload = {
        "assistant_id": "agent",
        "input": {"messages": [{"role": "user", "content": prompt}]},
        "config": {"configurable": {"thread_id": thread_id}},
        "stream_mode": ["messages"],
    }

    translator = StreamTranslator(run_id=run_id, thread_id=thread_id)
    _publish_live(agent, translator.start())

    try:
        async with httpx.AsyncClient(timeout=300) as client:
            async with client.stream(
                "POST",
                f"{registry.base_url(agent)}/runs/stream",
                json=lg_payload,
                headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            ) as resp:
                resp.raise_for_status()
                registry.record_success(agent)

                current_event_type = "messages/partial"
                async for line in resp.aiter_lines():
                    if line.startswith("event: "):
                        current_event_type = line[7:].strip()
                    elif line.startswith("data: "):
                        data_str = line[6:]
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        for ag_ui_line in translator.feed(current_event_type, data):
                            _publish_live(agent, ag_ui_line)

        for ag_ui_line in translator.finish():
            _publish_live(agent, ag_ui_line)

        usage = translator.usage_metadata or {}
        token_count = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)
        cost_usd = _estimate_cost(token_count)
        db.run_finish(run_id, "done", token_count=token_count, cost_usd=cost_usd)
        db.hotl_create(agent, run_id, translator.hotl_summary)

    except Exception as e:
        registry.record_failure(agent)
        db.run_finish(run_id, "error", error_msg=str(e))
        _publish_live(agent, translator.error(str(e)))
```

### Step 4.3: Add `GET /sse/{agent}/live` endpoint

- [ ] In `backend/api_server.py`, after the `@app.post("/agents/{name}/run")` block (after line ~287), add:

```python
@app.get("/sse/{agent}/live")
async def sse_live(agent: str):
    """
    Subscribe to AG-UI events from the currently-running scheduled task.
    Stays open, sends heartbeat comments every 15s to keep the connection alive.
    """
    q = _get_live_queue(agent)

    async def event_stream():
        while True:
            try:
                event = await asyncio.wait_for(q.get(), timeout=15.0)
                yield event
            except asyncio.TimeoutError:
                yield ": heartbeat\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

### Step 4.4: Verify `_estimate_cost` is defined before `trigger_agent_run` in the file

The `_estimate_cost` helper added in Task 3.2 is in the middle of the file. `trigger_agent_run` is near the top (line 52). Since Python resolves names at call time (not definition time) for function bodies, this is fine — `_estimate_cost` will be defined by the time `trigger_agent_run` actually runs.

### Step 4.5: Commit

```bash
git add backend/api_server.py
git commit -m "feat(gateway): fix scheduled runs to use /runs/stream + live SSE pub-sub (C-02)"
```

---

## Task 5: Fix health check, memory file path, missing endpoints — gateway housekeeping

**Files:**
- Modify: `backend/api_server.py`

All four changes are small and independent. Do them in one commit.

### Step 5.1: Fix health check `/ok` → `/assistants`

- [ ] In `backend/api_server.py`, in `agents_status()` (around line 174), change:

```python
r = await client.get(f"{registry.base_url(agent.name)}/ok")
```

to:

```python
r = await client.get(f"{registry.base_url(agent.name)}/assistants")
```

### Step 5.2: Fix `_read_agent_file` to check `skills/AGENTS.md` first

- [ ] Replace `_read_agent_file` (lines 464–471):

```python
def _read_agent_file(name: str, filename: str) -> str:
    agent = registry.get(name)
    if not agent:
        return f"# {filename}\n\n_(Agent '{name}' not registered.)_\n"
    # Memory: check skills/AGENTS.md first (deepagent convention), fall back to MEMORY.md
    if filename == "MEMORY.md":
        for candidate in (
            PROJECT_ROOT / agent.dir / "skills" / "AGENTS.md",
            PROJECT_ROOT / agent.dir / "MEMORY.md",
        ):
            if candidate.exists():
                return candidate.read_text()
        return "# Memory\n\n_(No content yet — written by the agent during runs.)_\n"
    path = PROJECT_ROOT / agent.dir / filename
    if path.exists():
        return path.read_text()
    return f"# {filename}\n\n_(No content yet — this file is managed by the agent.)_\n"
```

### Step 5.3: Fix search to also look in `skills/AGENTS.md`

- [ ] In `global_search()` (around line 541), replace the file-search loop:

```python
    for agent in registry.get_all():
        agent_dir = PROJECT_ROOT / agent.dir
        candidates = [
            (agent_dir / "skills" / "AGENTS.md", "memory"),
            (agent_dir / "MEMORY.md", "memory"),
            (agent_dir / "RULES.md", "rules"),
        ]
        seen_types: set[str] = set()
        for fpath, ftype in candidates:
            if ftype in seen_types:
                continue  # already matched a memory file for this agent
            if fpath.exists():
                content = fpath.read_text()
                if q_lower in content.lower():
                    idx = content.lower().index(q_lower)
                    start = max(0, idx - 60)
                    excerpt = content[start : idx + 60].strip()
                    results.append({
                        "type": ftype,
                        "agent": agent.name,
                        "id": fpath.name,
                        "excerpt": excerpt,
                        "created_at": None,
                    })
                    seen_types.add(ftype)
```

### Step 5.4: Add `POST /hotl/clear` endpoint

- [ ] In `backend/api_server.py`, after `mark_all_hotl_read` (after line ~396) and **before** `@app.post("/hotl/{log_id}/read")`, add:

```python
@app.post("/hotl/clear")
def clear_hotl(agent: str | None = None):
    """Permanently delete HOTL logs. Destructive — confirm in UI before calling."""
    deleted = db.hotl_clear(agent=agent)
    return {"ok": True, "deleted": deleted}
```

**Important:** FastAPI route order matters for string-vs-path-param ambiguity. Since `log_id` is typed `int`, `clear` (a string) won't match it — but putting `clear` before `{log_id}/read` is still best practice.

### Step 5.5: Add `GET /chat/{agent}/history` endpoint

- [ ] In `backend/api_server.py`, after the `GET /sse/{agent}/live` endpoint, add:

```python
@app.get("/chat/{agent}/history")
async def chat_history(agent: str, thread_id: str):
    """
    Proxy to LangGraph thread state. Returns messages for session restore.
    Returns {"messages": []} if agent is down or thread not found.
    """
    agent_cfg = registry.get(agent)
    if not agent_cfg or not agent_cfg.enabled:
        return {"messages": []}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                f"{registry.base_url(agent)}/threads/{thread_id}/state"
            )
            r.raise_for_status()
            state = r.json()
            # LangGraph thread state: {"values": {"messages": [...]}, ...}
            messages_raw = state.get("values", {}).get("messages", [])
            messages = [
                {"role": m.get("type", "human") if m.get("type") != "ai" else "assistant",
                 "content": m.get("content", "")}
                for m in messages_raw
                if m.get("type") in ("human", "ai")
            ]
            return {"messages": messages}
    except Exception:
        return {"messages": []}
```

### Step 5.6: Verify gateway starts clean

- [ ] Run:

```bash
.venv/bin/python backend/api_server.py &
sleep 2
curl http://localhost:8080/ok
curl http://localhost:8080/nav-counts
kill %1
```

Expected: `{"ok":true}` then `{"hitl":0,"hotlUnread":0}`. No startup errors.

### Step 5.7: Commit

```bash
git add backend/api_server.py
git commit -m "fix(gateway): health check /assistants, memory path skills/AGENTS.md, hotl/clear, chat history"
```

---

## Task 6: Fix deepagent `aafter_agent` — C-03

**Files:**
- Modify: `agents/budget-deepagent/agent.py`

The crash is on line 61: `runtime.config.get(...)`. Since the gateway now owns HOTL, remove lines 58–70 entirely. Keep only the Sheets sync.

Also: line 5 imports `AgentMiddleware` from `langchain.agents.middleware.types` — this is likely wrong. The correct import is from `deepagents.middleware`.

### Step 6.1: Fix import

- [ ] In `agents/budget-deepagent/agent.py`, replace line 5:

```python
from langchain.agents.middleware.types import AgentMiddleware
```

with:

```python
from deepagents.middleware import AgentMiddleware
```

### Step 6.2: Remove HOTL callback from `aafter_agent`

- [ ] Replace the entire `aafter_agent` method (lines 51–71):

```python
    async def aafter_agent(self, state, runtime):
        from sheets_to_csv import sync_from_csv_to_sheets
        try:
            sync_from_csv_to_sheets()
        except Exception as e:
            print(f"[BudgetSyncMiddleware] Post-sync failed: {e}")
        return None
```

The removed lines (58–70) were: the HOTL `httpx.post` call that accessed `runtime.config`. That code is no longer needed — the gateway extracts HOTL from the stream automatically.

### Step 6.3: Verify agent still starts

- [ ] Run:

```bash
cd agents/budget-deepagent
../../.venv/bin/python -c "import agent; print('import ok')"
```

Expected: `import ok`. No ImportError.

### Step 6.4: Commit

```bash
git add agents/budget-deepagent/agent.py
git commit -m "fix(budget-agent): remove runtime.config crash, remove HOTL callback (gateway owns HOTL) (C-03)"
```

---

## Task 7: Update frontend chat routing to go through gateway

**Files:**
- Modify: `frontend/src/app/api/chat/[agent]/route.ts`

Currently this POST directly to `{agent_url}/runs/stream` (bypassing the gateway). Change it to POST to the gateway's `POST /agents/{name}/run`.

### Step 7.1: Read the current route file

- [ ] Read `frontend/src/app/api/chat/[agent]/route.ts` to confirm current content before editing.

The current POST handler (from our earlier exploration) does:
```ts
// forwards to {agent_url}/runs/stream directly
const agentUrl = AGENTS[name]?.url ?? `http://localhost:${AGENTS[name]?.port}`;
const resp = await fetch(`${agentUrl}/runs/stream`, { ... });
```

### Step 7.2: Replace POST handler

- [ ] Update `frontend/src/app/api/chat/[agent]/route.ts`. Replace only the POST handler body to call the gateway instead:

```typescript
const API_BASE = process.env.AGENT_API_URL ?? "http://localhost:8080";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agent: string }> }
) {
  const { agent } = await params;
  try {
    const body = await request.json();
    // body has shape: { thread_id, messages }
    // Gateway expects exactly this format — no LangGraph fields needed here
    const upstream = await fetch(`${API_BASE}/agents/${agent}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      return new Response(
        JSON.stringify({ error: `Gateway returned ${upstream.status}` }),
        { status: upstream.status, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
```

### Step 7.3: Update GET handler to use `API_BASE`

- [ ] Update the GET handler in the same file to use `API_BASE` instead of direct agent URL:

```typescript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ agent: string }> }
) {
  const { agent } = await params;
  const url = new URL(request.url);
  const threadId = url.searchParams.get("thread_id") ?? "";
  if (!threadId) return Response.json({ messages: [] });

  try {
    const r = await fetch(
      `${API_BASE}/chat/${agent}/history?thread_id=${encodeURIComponent(threadId)}`,
      { cache: "no-store" }
    );
    if (!r.ok) return Response.json({ messages: [] });
    return Response.json(await r.json());
  } catch {
    return Response.json({ messages: [] });
  }
}
```

### Step 7.4: Commit

```bash
git add frontend/src/app/api/chat/
git commit -m "feat(frontend): route chat through gateway (AG-UI), fix history endpoint"
```

---

## Task 8: Update `use-agent-chat.ts` to consume AG-UI events

**Files:**
- Modify: `frontend/src/hooks/use-agent-chat.ts`

The hook currently parses LangGraph `stream_mode=["updates"]` format. It needs to parse AG-UI events coming from the gateway.

### Step 8.1: Read current hook file

- [ ] Read `frontend/src/hooks/use-agent-chat.ts` to confirm the current state structure and message types before editing.

### Step 8.2: Replace the SSE parsing section

The hook's `sendMessage` function calls POST and reads the SSE stream. Replace only the stream parsing logic (the `for await` loop or equivalent) with AG-UI event handling:

- [ ] Update the stream parsing section in `use-agent-chat.ts`. Find where the hook iterates over SSE lines and replace with:

```typescript
// Inside the stream reading loop — replace the existing parsing:
for await (const line of lines) {
  if (!line.startsWith("data: ")) continue;
  const raw = line.slice(6).trim();
  if (!raw) continue;

  let event: { type: string; [key: string]: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    continue;
  }

  switch (event.type) {
    case "RUN_STARTED":
      setRunStatus("running");
      break;

    case "TEXT_MESSAGE_START":
      setMessages((prev) => [
        ...prev,
        {
          id: event.messageId as string,
          role: "assistant" as const,
          content: "",
          streaming: true,
        },
      ]);
      break;

    case "TEXT_MESSAGE_CONTENT":
      setMessages((prev) =>
        prev.map((m) =>
          m.id === event.messageId
            ? { ...m, content: m.content + (event.delta as string) }
            : m
        )
      );
      break;

    case "TEXT_MESSAGE_END":
      setMessages((prev) =>
        prev.map((m) =>
          m.id === event.messageId ? { ...m, streaming: false } : m
        )
      );
      break;

    case "TOOL_CALL_START":
      setMessages((prev) =>
        prev.map((m) =>
          m.id === event.parentMessageId
            ? {
                ...m,
                toolCalls: [
                  ...(m.toolCalls ?? []),
                  {
                    id: event.toolCallId as string,
                    name: event.toolCallName as string,
                    args: "",
                    result: undefined,
                  },
                ],
              }
            : m
        )
      );
      break;

    case "TOOL_CALL_RESULT":
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          toolCalls: m.toolCalls?.map((tc) =>
            tc.id === event.toolCallId
              ? { ...tc, result: event.content as string }
              : tc
          ),
        }))
      );
      break;

    case "RUN_FINISHED":
      setRunStatus("idle");
      break;

    case "RUN_ERROR":
      setRunStatus("error");
      setError(event.message as string);
      break;
  }
}
```

Also update the message type to include the new fields if not already present:

```typescript
type Message = {
  id: string;
  role: "human" | "assistant";
  content: string;
  streaming?: boolean;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: string;
    result?: string;
  }>;
};
```

Update `sendMessage` to send the AG-UI-format body:

```typescript
const sendMessage = async (content: string) => {
  const threadId = getOrCreateThreadId(agentName); // localStorage
  const userMsg: Message = { id: crypto.randomUUID(), role: "human", content };
  setMessages((prev) => [...prev, userMsg]);

  const response = await fetch(`/api/chat/${agentName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      thread_id: threadId,
      messages: [...messages, userMsg].map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    }),
  });
  // ... stream reading below
};
```

Add `getOrCreateThreadId` helper (localStorage):

```typescript
function getOrCreateThreadId(agent: string): string {
  const key = `jimmys-agents:thread:${agent}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const newId = `thread-${agent}-${crypto.randomUUID()}`;
  localStorage.setItem(key, newId);
  return newId;
}
```

### Step 8.3: Commit

```bash
git add frontend/src/hooks/use-agent-chat.ts
git commit -m "feat(frontend): update chat hook to parse AG-UI events, add localStorage thread persistence"
```

---

## Task 9: Add `POST /api/hotl/clear/route.ts`

**Files:**
- Create: `frontend/src/app/api/hotl/clear/route.ts`

### Step 9.1: Create the route

- [ ] Create `frontend/src/app/api/hotl/clear/route.ts`:

```typescript
const API_BASE = process.env.AGENT_API_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const agent = url.searchParams.get("agent") ?? undefined;
  try {
    const upstream = await fetch(
      `${API_BASE}/hotl/clear${agent ? `?agent=${encodeURIComponent(agent)}` : ""}`,
      { method: "POST" }
    );
    if (!upstream.ok) {
      return Response.json({ error: "Gateway error" }, { status: upstream.status });
    }
    return Response.json(await upstream.json());
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
```

### Step 9.2: Commit

```bash
git add frontend/src/app/api/hotl/clear/
git commit -m "feat(frontend): add POST /api/hotl/clear proxy route"
```

---

## Task 10: Minor UI fixes

**Files:**
- Modify: various frontend component files

Bundle all minor fixes into one commit.

### Step 10.1: Fix m-03 — hardcoded localhost:8080

- [ ] Search for all hardcoded `localhost:8080` references in frontend src:

```bash
grep -r "localhost:8080" frontend/src --include="*.ts" --include="*.tsx" -l
```

For each file found, replace `http://localhost:8080` with `process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"` or route through the `/api/` proxy layer instead.

### Step 10.2: Fix m-01 — Memory tab word-break CSS

- [ ] Find the Memory tab component (likely in `frontend/src/app/agent/[name]/page.tsx` or a `MemoryPanel` component). Add `break-words` Tailwind class to the memory content `<pre>` or `<div>`.

### Step 10.3: Fix m-04 — Chat scroll anchor

- [ ] Find the chat message list container. Add `ref={scrollRef}` and `useEffect` to auto-scroll on new messages:

```typescript
const scrollRef = useRef<HTMLDivElement>(null);
useEffect(() => {
  scrollRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages]);
// Place <div ref={scrollRef} /> at the bottom of the message list
```

### Step 10.4: Commit

```bash
git add frontend/src/
git commit -m "fix(frontend): m-01 word-break, m-03 hardcoded ports, m-04 chat scroll"
```

---

## Task 11: Full end-to-end verification

Run all checks before opening a PR.

### Step 11.1: Run translator unit tests

- [ ] Run:

```bash
cd /Users/jcreed/Documents/GitHub/jimmys-agents
.venv/bin/pytest tests/test_translator.py -v
```

Expected: 9 tests PASS.

### Step 11.2: Gateway health

- [ ] Start gateway, then:

```bash
curl http://localhost:8080/ok          # {"ok":true}
curl http://localhost:8080/nav-counts  # {"hitl":0,"hotlUnread":0}
```

### Step 11.3: Agent status (RUNNING not DOWN)

- [ ] Start budget-agent (`make run-budget`), then:

```bash
curl http://localhost:8080/agents | python -m json.tool
```

Expected: `budget-agent` shows `"status": "RUNNING"` (not DOWN — health check now uses `/assistants`).

### Step 11.4: Chat run end-to-end

- [ ] Send a test message via curl:

```bash
curl -N -X POST http://localhost:8080/agents/budget-agent/run \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"thread_id":"e2e-test-001","messages":[{"role":"user","content":"Say hello"}]}'
```

Expected: AG-UI event stream — `RUN_STARTED`, `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT` chunks, `TEXT_MESSAGE_END`, `RUN_FINISHED`.

### Step 11.5: Run record + HOTL created

- [ ] After the curl completes:

```bash
curl http://localhost:8080/runs?agent=budget-agent | python -m json.tool
curl http://localhost:8080/hotl?agent=budget-agent | python -m json.tool
```

Expected: One run record with `"status": "done"`, one HOTL entry with `overview` and `tools`.

### Step 11.6: Memory tab reads skills/AGENTS.md

- [ ] Run:

```bash
curl http://localhost:8080/agents/budget-agent/memory | python -m json.tool
```

Expected: Returns the content of `agents/budget-deepagent/skills/AGENTS.md` (not "No content yet").

### Step 11.7: hotl/clear works

- [ ] Run:

```bash
curl -X POST "http://localhost:8080/hotl/clear?agent=budget-agent"
# {"ok":true,"deleted":N}
curl http://localhost:8080/hotl?agent=budget-agent
# {"..."}  — empty list
```

### Step 11.8: Final commit + push branch

```bash
git log --oneline main..HEAD  # review all commits
git push -u origin feat/ag-ui-harness-overhaul
```

---

## Known Remaining Work (out of scope for this plan)

- **Issue #12 (auth)** — deferred until Neon DB migration
- **m-02** (dashboard agent count denominator) — minor, separate PR
- **m-05** (workflow description text) — copy change, trivial
- **m-06** (clear logs error handling) — now that `hotl/clear` exists, the UI already works
- **job-search-agent** — incomplete agent, James builds it
- **Stream timeout (5 min)** — `httpx.AsyncClient(timeout=300)` already enforces this; no change needed
