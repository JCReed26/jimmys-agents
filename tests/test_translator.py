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
    for chunk in chunks[:-1]:
        events.extend(parse_events(list(t.feed("messages/partial", [chunk]))))
    # Final AIMessage arrives on messages/complete
    events.extend(parse_events(list(t.feed("messages/complete", [chunks[-1]]))))
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


def test_orphaned_tool_message_ignored():
    """ToolMessage for unknown tc_id should not emit any events."""
    t = StreamTranslator("run-001", "thread-001")
    # Feed a ToolMessage for a tc_id that was never opened
    events = parse_events(list(t.feed("messages/partial", [{
        "type": "ToolMessage",
        "id": "tmsg-orphan",
        "tool_call_id": "tc-unknown",
        "content": "surprise",
    }])))
    assert events == []


def test_ai_message_content_emitted_after_tool_call():
    """Final AIMessage with content is emitted even when _active_msg_id is None."""
    t = StreamTranslator("run-001", "thread-001")
    chunks = [
        {"type": "AIMessageChunk", "id": "msg-1", "content": "", "tool_calls": [
            {"id": "tc-1", "name": "read_file", "args": {"path": "data.csv"}},
        ]},
        {"type": "ToolMessage", "id": "tm-1", "tool_call_id": "tc-1", "content": "csv data"},
    ]
    events = []
    for chunk in chunks:
        events.extend(parse_events(list(t.feed("messages/partial", [chunk]))))

    # Final AIMessage via messages/complete — content should be emitted
    final = {"type": "AIMessage", "id": "msg-2", "content": "Here are the results.", "tool_calls": []}
    events.extend(parse_events(list(t.feed("messages/complete", [final]))))
    events.extend(parse_events(list(t.finish())))

    types = [e["type"] for e in events]
    assert "TEXT_MESSAGE_START" in types
    assert "TEXT_MESSAGE_CONTENT" in types
    assert "TEXT_MESSAGE_END" in types

    content_event = next(e for e in events if e["type"] == "TEXT_MESSAGE_CONTENT")
    assert content_event["delta"] == "Here are the results."
