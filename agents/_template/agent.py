"""
Template agent — copy this directory to agents/{name}/ and customize.

Steps:
1. cp -r agents/_template agents/{name}
2. Edit agent.py: tools, system prompt, middleware, _AGENT_NAME
3. Edit server.py: update _AGENT_NAME to match
4. Add to agents.yaml (copy budget-agent entry, update name/port/dir)
5. Add to frontend/src/lib/agents.ts (copy budget-agent entry)
6. Add run-{name} to Makefile (copy run-budget target, update port/dir)
7. Create skills/{skill-name}/SKILL.md — name in frontmatter MUST match directory name
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from langchain_core.tools import tool
from langchain.agents.middleware.types import AgentMiddleware
from backend.models import gemini_flash_model as llm
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend

_AGENT_NAME = "template-agent"  # Update this when copying

SYSTEM_PROMPT = """You are a helpful assistant. Answer concisely and clearly."""


# ─── Optional middleware ─────────────────────────────────────────────────────
# Uncomment and customize to run logic before/after each agent invocation.
#
# class MyMiddleware(AgentMiddleware):
#     async def abefore_agent(self, state, runtime):
#         print(f"[{_AGENT_NAME}] Starting run...")
#
#     async def aafter_agent(self, state, runtime):
#         print(f"[{_AGENT_NAME}] Run complete.")


@tool
def hello_world(name: str) -> str:
    """Say hello to someone by name."""
    return f"Hello, {name}! The agent connection is working end-to-end."


tools = [hello_world]

backend = FilesystemBackend(root_dir=Path(__file__).parent.absolute())
agent = create_deep_agent(
    model=llm,
    tools=tools,
    system_prompt=SYSTEM_PROMPT,
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    backend=backend,
    # middleware=[MyMiddleware()],
    # interrupt_on={
    #     "hello_world": False,         # no interrupt (safe read-only tools)
    #     "some_write_tool": True,      # pause for human approval before executing
    # },
    name=_AGENT_NAME,
)

