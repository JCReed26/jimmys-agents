# Deployment

## Local Dev

```bash
make run-template    # :8000
make run-gmail       # :8001
make run-calendar    # :8002
make run-budget      # :8003
make run-frontend    # :3000
# or all at once:
make start-all
```

Health check: `curl http://localhost:{port}/ok` → `{"ok":true}`

## LangSmith Cloud (not yet deployed)

```bash
cd agents/_template
../../.venv/bin/langgraph deploy
```

Follow prompts → deployment URL: `https://template-agent-xxxx.langsmith.dev`

After deploy:
1. Set `NEXT_PUBLIC_TEMPLATE_LANGSMITH_URL` in `frontend/.env.local`
2. Restart frontend — `getAgentUrl(cfg)` will route to LangSmith automatically

## Verification Checklist (before any commit)
```
[ ] make run-template starts on :8000
[ ] curl http://localhost:8000/ok → {"ok":true}
[ ] npm run dev compiles in < 30s
[ ] /agent/template-agent loads in browser
[ ] Sending a message streams a response
[ ] Todo list appears and updates
[ ] Subagent cards appear
[ ] Thread history sidebar shows the new thread
[ ] LangSmith trace at smith.langchain.com/projects/jimmys-agents
```
