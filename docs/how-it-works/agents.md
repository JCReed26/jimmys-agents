# Agents: How They Work

## Runtime
Every agent runs as a `langgraph dev` process. No uvicorn, no FastAPI (budget-agent is legacy exception).

```bash
cd agents/{name} && ../../.venv/bin/langgraph dev --host 0.0.0.0 --port {port} --no-browser
```

## langgraph.json (required in every agent dir)
```json
{
  "dependencies": ["."],
  "graphs": { "agent": "./agent.py:agent" },
  "env": "../../.env"
}
```
`"env": "../../.env"` is non-negotiable — without it LangSmith tracing is silently dropped.

## deepagents Pattern
```python
from deepagents import create_deep_agent
from deepagents.backends import FilesystemBackend
from deepagents.middleware.subagents import SubAgent

researcher: SubAgent = {
    "name": "researcher",
    "description": "...",
    "system_prompt": "...",
    "tools": [tavily_search, fetch_url],
}

agent = create_deep_agent(
    model=llm,
    tools=[...],
    system_prompt="...",
    skills=["skills/"],
    memory=["skills/AGENTS.md"],
    subagents=[researcher, summarizer],
    backend=FilesystemBackend(root_dir=Path(__file__).parent.absolute()),
    name="agent-name",
)
```

## .env Loading
`load_dotenv()` in `agent.py` fires too late for LangSmith init. The `langgraph.json` `"env"` field is what actually injects env vars into the server process at startup.

## Adding a New Agent
1. `cp -r agents/_template agents/{name}`
2. Edit `agent.py`: tools, subagents, system_prompt, name
3. Add to `agents.yaml` (port, dir)
4. Add to `frontend/src/lib/agents.ts` (copy template-agent entry)
5. Add `run-{name}` to `Makefile`
6. Set `NEXT_PUBLIC_{NAME}_AGENT_URL` in `frontend/.env.local`
