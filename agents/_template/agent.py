"""
Template agent — reference implementation with all deepagents patterns.

Copy this directory to agents/{name}/ and customize.
Steps:
1. cp -r agents/_template agents/{name}
2. Edit agent.py: tools, subagents, system prompt, _AGENT_NAME
3. Add to agents.yaml (copy template-agent entry, update name/port/dir)
4. Add to frontend/src/lib/agents.ts (copy template-agent entry)
5. Add run-{name} to Makefile (copy run-template target, update port/dir)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from backend.models import gemini_flash_model as llm
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware.subagents import SubAgent

from tools import tavily_search, fetch_url

_AGENT_NAME = "template-agent"

SYSTEM_PROMPT = """You are a web research assistant. When given a research task:
1. Immediately write a todo list using write_todos (break the work into 3-5 steps).
2. Delegate deep research to the researcher subagent.
3. Delegate summarization to the summarizer subagent.
4. Update todo statuses as you progress.
5. Deliver a final structured answer.

Always update todos to reflect real progress — users see them live."""

# Subagents — the main agent delegates to these via the task() tool
researcher: SubAgent = {
    "name": "researcher",
    "description": (
        "Performs focused web research on a specific topic using Tavily search. "
        "Use for any task requiring web search or URL reading."
    ),
    "system_prompt": (
        "You are a research specialist. Search thoroughly using multiple queries. "
        "Read full URLs when needed. Return structured findings with sources."
    ),
    "tools": [tavily_search, fetch_url],
}

summarizer: SubAgent = {
    "name": "summarizer",
    "description": (
        "Condenses research findings into clear, structured output. "
        "Use after researcher has gathered data."
    ),
    "system_prompt": (
        "You are a synthesis expert. Take raw research and produce "
        "clear, concise, actionable summaries. Use markdown formatting."
    ),
    "tools": [],
}

backend = FilesystemBackend(root_dir=Path(__file__).parent.absolute())

agent = create_deep_agent(
    model=llm,
    tools=[tavily_search, fetch_url],
    system_prompt=SYSTEM_PROMPT,
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    subagents=[researcher, summarizer],
    backend=backend,
    name=_AGENT_NAME,
)
