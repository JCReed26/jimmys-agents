# Agent Contract: template-agent

**Port:** 8000 | **Pattern:** deepagents `create_deep_agent` + `langgraph dev`

## Tools
| Tool | Source | Notes |
|---|---|---|
| `tavily_search` | langchain-tavily | Web search, 5 results |
| `fetch_url` | tools.py | Fetches URL text, capped 6000 chars |
| `write_todos` | deepagents built-in | Writes `[{content, status}]` to state |
| `task` | deepagents built-in | Delegates to a subagent |

## Subagents
| Name | Tools | Purpose |
|---|---|---|
| `researcher` | tavily_search, fetch_url | Deep web research |
| `summarizer` | none | Condense findings |

## State
- `messages` — chat history (LangGraph standard)
- `todos` — `[{content: str, status: "pending"|"in_progress"|"completed"}]`

## Required Env
- `TAVILY_API_KEY` — agent fails without it
- `OPENROUTER_API_KEY` — for gemini_flash_model

## Files
```
agents/_template/
├── agent.py        # create_deep_agent definition
├── tools.py        # tavily_search + fetch_url
├── langgraph.json  # {"graphs":{"agent":"./agent.py:agent"},"env":"../../.env"}
└── skills/AGENTS.md
```

## Copy Pattern
```bash
cp -r agents/_template agents/{name}
# Edit agent.py, add to agents.yaml + agents.ts + Makefile
```
