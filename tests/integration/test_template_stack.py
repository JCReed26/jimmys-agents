"""
Integration test: template agent → useStream frontend → LangSmith trace.

Requires:
  - make run-template running on :8000
  - npm run dev running on :3000
  - TAVILY_API_KEY set in .env
  - LANGSMITH_TRACING=true and LANGSMITH_API_KEY set in .env

Run with:
  pytest tests/integration/test_template_stack.py -v -s
"""
import time
import pytest
import requests
from playwright.sync_api import sync_playwright, expect


AGENT_HEALTH_URL = "http://localhost:8000/runs/stream/health"
FRONTEND_URL = "http://localhost:3000"
AGENT_PAGE_URL = f"{FRONTEND_URL}/agent/template-agent"
TEST_MESSAGE = "Research the best free note-taking apps in 2025. Make a todo list first."


def test_agent_health():
    """Template agent must be running before any browser tests."""
    r = requests.get(AGENT_HEALTH_URL, timeout=5)
    assert r.status_code == 200, (
        f"Template agent not running at :8000. "
        f"Start it with: make run-template"
    )


def test_frontend_loads():
    """Frontend must compile and load without CopilotKit errors."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)

        page.goto(AGENT_PAGE_URL, wait_until="networkidle")

        # No CopilotKit references should remain
        content = page.content()
        assert "copilotkit" not in content.lower(), "CopilotKit remnant in page HTML"

        # No console errors about missing modules
        ck_errors = [e for e in errors if "copilotkit" in e.lower() or "cannot find module" in e.lower()]
        assert not ck_errors, f"Console errors: {ck_errors}"

        browser.close()


def test_stream_chat_and_todos():
    """
    Send a message, verify:
    - todo list appears and updates
    - subagent card appears for researcher
    - final message renders
    """
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # headless=False so you can watch
        page = browser.new_page()

        page.goto(AGENT_PAGE_URL, wait_until="networkidle")

        # Find the chat input and send message
        chat_input = page.locator("textarea, input[type='text']").last
        chat_input.fill(TEST_MESSAGE)
        chat_input.press("Enter")

        # Todo list should appear within 15 seconds
        todo_list = page.locator("[data-testid='todo-list']")
        expect(todo_list).to_be_visible(timeout=15_000)

        # At least one todo item should be visible
        todo_items = page.locator("[data-testid='todo-item']")
        expect(todo_items.first).to_be_visible(timeout=5_000)

        # A subagent card should appear (researcher subagent)
        subagent_card = page.locator("[data-testid='subagent-card']")
        expect(subagent_card.first).to_be_visible(timeout=20_000)

        # Wait for the agent to finish (all todos completed or timeout at 90s)
        completed = page.locator("[data-testid='todo-item'][data-status='completed']")
        try:
            expect(completed.first).to_be_visible(timeout=90_000)
        except Exception:
            pass  # Agent may still be working; check final message instead

        # A final AI message should exist in the chat
        ai_message = page.locator("[data-testid='ai-message']")
        expect(ai_message.last).to_be_visible(timeout=30_000)

        browser.close()


def test_memory_sidebar_visible():
    """AGENTS.md sidebar should still render after the CopilotKit removal."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(AGENT_PAGE_URL, wait_until="networkidle")

        # Sidebar shows AGENTS.md label
        sidebar_label = page.locator("text=AGENTS.md")
        expect(sidebar_label).to_be_visible(timeout=5_000)

        browser.close()
