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
            # Close any active streaming message
            was_streaming = self._active_msg_id is not None
            if self._active_msg_id:
                yield self._event("TEXT_MESSAGE_END", {"messageId": self._active_msg_id})
                self._active_msg_id = None
            # Close any open tool calls
            for tc_id in list(self._open_tool_calls):
                yield self._event("TOOL_CALL_END", {"toolCallId": tc_id})
            self._open_tool_calls.clear()
            # Emit final message content if present and not already streamed
            content = msg.get("content", "")
            if content and not self._overview:
                self._overview = content
            if content and not was_streaming:
                final_id = msg.get("id") or str(uuid.uuid4())
                yield self._event("TEXT_MESSAGE_START", {"messageId": final_id, "role": "assistant"})
                yield self._event("TEXT_MESSAGE_CONTENT", {"messageId": final_id, "delta": content})
                yield self._event("TEXT_MESSAGE_END", {"messageId": final_id})
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
