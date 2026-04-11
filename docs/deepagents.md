# deepagents Reference

Version: `deepagents==0.4.7`

## create_deep_agent

```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware.subagents import SubAgent

agent = create_deep_agent(
    model=llm,
    tools=[tool1, tool2],
    system_prompt="...",
    skills=["skills/"],           # directory of SKILL.md files
    memory=["skills/AGENTS.md"],  # persistent notebook file
    subagents=[researcher],       # list of SubAgent TypedDicts
    backend=FilesystemBackend(root_dir=Path(__file__).parent.absolute()),
    name="agent-name",            # must match langgraph.json graph key
)
```

**v0.4.7 API notes:**
- No `state_schema` param (would cause TypeError)
- No `permissions` param
- `SubAgent` is a TypedDict — pass as a plain dict or typed variable
- `TodoListMiddleware` is built-in — `todos` appears in state automatically

## SubAgent TypedDict
```python
researcher: SubAgent = {
    "name": "researcher",
    "description": "Used by main agent to decide when to delegate",
    "system_prompt": "You are a research specialist...",
    "tools": [tavily_search, fetch_url],  # optional
    # "model": llm,         # optional override
    # "middleware": [...],  # optional
    # "skills": [...],      # optional
}
```

## FilesystemBackend
```python
FilesystemBackend(root_dir=Path(__file__).parent.absolute())
```
Stores memory at `root_dir/MEMORY.md`. Works in local dev and LangSmith cloud.

## Built-in Tools (injected by deepagents)
- `write_todos(todos: list[dict])` — writes `[{content, status}]` to state
- `task(description, subagent_type)` — delegates to a named subagent

## Skills
Files in `skills/` directory are loaded as instruction modules. AGENTS.md is the persistent memory file — agents read and write it between runs.

## Middleware
```python
from deepagents.middleware import AgentMiddleware

class MyMiddleware(AgentMiddleware):
    async def before_agent(self, state, runtime): ...
    async def after_agent(self, state, runtime): ...
```
