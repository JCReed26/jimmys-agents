# User Guide

How to use jimmys-agents day-to-day.

---

## Starting Everything

```bash
make start-all       # starts all services in background (logs go to logs/)
make stop-all        # stops everything

# Or run interactively (separate terminals):
make run-api-server  # gateway on :8080
make run-frontend    # dashboard on :3000
make run-budget      # budget-deepagent on :8003
make run-gmail       # gmail-agent on :8001
make run-calendar    # calendar-agent on :8002
```

Visit `http://localhost:3000`. You'll be redirected to the login page.

---

## Logging In

1. Enter your email → click "Send code"
2. Check your email for the OTP code
3. Enter the 6-digit code → you're in

Sessions persist across browser closes. You'll be auto-redirected if your session expires.

---

## Dashboard

The main page shows all agents assigned to your account. Each card shows:
- **Agent name** and description
- **Status indicator**: green (last run succeeded), red (last run failed), grey (no runs yet)
- **Last run info**: time, cost, token count
- Click any card → opens the agent detail page

---

## Chatting with an Agent

1. Click an agent card from the dashboard
2. You land on the **Chat** tab
3. Type a message and hit Enter (or click Send)
4. The agent streams its response in real time — you can see tool calls as they happen
5. Your conversation is saved automatically in a thread

### Thread Management

Each agent remembers up to 10 conversation threads. To start a new thread:
- Click the thread picker dropdown above the chat input
- Select "**+ New thread**"

To switch to a previous conversation:
- Click the thread picker → select a thread by date

Threads persist across page reloads and browser restarts.

---

## HITL Inbox — Approving Agent Actions

Some agents pause and wait for your approval before taking an action (sending an email, making a booking, etc.). When this happens:

1. The sidebar badge on "HITL Inbox" shows a count
2. Click **HITL Inbox** in the nav
3. Each item shows: agent name, what it wants to do, and the full payload
4. Click **Approve** to let it proceed, or **Reject** to cancel

The agent is waiting and will continue immediately after you decide.

---

## Logs — Reviewing What Agents Did

The **Run Logs** page shows a post-run summary for every agent run. Each entry shows:
- Agent name and run timestamp
- Overview of what the agent did
- Tools the agent called (expandable)
- Cost and token usage
- LangSmith trace link (if available) — click "Trace →" to see the full reasoning chain

Logs are marked unread until you view them (blue badge in nav).

---

## Schedules

Agents can run on a schedule (e.g., every Monday at 9am).

### Viewing schedules
Click **Schedules** in the nav → shows all scheduled workflows.

### Enabling/disabling a schedule
Toggle the switch on any schedule row. Takes effect immediately (no restart needed).

### Triggering a run manually
Click **Run now** on any schedule → runs immediately, same as if the cron fired.

### Creating a new schedule
Currently done via the API or directly in the database (dashboard UI for creating schedules is planned). The schedule format uses standard cron syntax.

---

## Agent Memory

Each agent has a persistent memory file (`AGENTS.md`) where it stores preferences, patterns it's learned about you, and working notes.

1. Click an agent card → go to the **Memory** tab
2. You'll see the raw contents of the agent's memory file
3. Click **Edit** to modify it directly
4. Click **Save** — the agent reads this file at the start of every run

Use this to:
- Tell the agent your preferences ("Always summarize in bullets, not paragraphs")
- Correct persistent mistakes ("My rent is $1,800, not $1,500")
- Add context ("I have a Costco membership — factor that into grocery analysis")

---

## Run History

Each agent has a **Runs** tab showing the last 10 runs:
- Status (success / error)
- Start time and duration
- Cost and token count
- LangSmith trace link (if tracing is enabled)

---

## Observability

The **Observability** page shows aggregate stats: runs per agent, cost over time, HITL resolution rates.

---

## Settings — Service Health

The **Settings** page shows a live health panel for all services (API server, agents). Each service shows:
- Green dot = running and healthy
- Red dot = not reachable
- Yellow dot = reachable but slow (>1s response)
- Latency in milliseconds

Auto-refreshes every 30 seconds.

---

## Admin (Superadmin Only)

The **Admin** page manages the multi-tenant system:

### Tenants tab
- Create new tenants (clients, sub-accounts)
- See all tenants and their IDs
- Click a tenant to select it (affects Agents and Users tabs)

### Agents tab
- Shows all registered agents
- Assign agents to the selected tenant (they appear on that tenant's dashboard)
- Remove agent access from a tenant

### Users tab
- Add a user to the selected tenant by their Supabase auth UUID
  - Find the UUID: Supabase dashboard → Authentication → Users → copy the user's UUID
- Remove a user from a tenant

---

## Troubleshooting

**Agent not responding / spinner forever**
- Check Settings health panel — is the agent service running?
- Check `logs/{agent}.log` for errors (`make start-all` puts logs there)
- Try `make run-budget` (interactive) to see errors live

**"No agents" on dashboard**
- Check that your user account is linked to a tenant with agents assigned
- Ask James to check the Admin page

**Chat history missing after reload**
- Thread IDs are stored in localStorage — cleared if you clear browser data
- The thread picker shows your most recent thread; select it to load history

**HITL items not showing**
- The polling badge updates every 15 seconds — wait a moment
- Check that the agent is actually calling the HITL endpoint (check Run Logs for the run)
