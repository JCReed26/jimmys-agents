# E2E Feature Verification Checklist

**How this works**: James performs every step marked `[James]`. The agent verifying the session
checks logs and DB for each step marked `[Agent: verify]`. James does not look at logs — that's
the agent's job.

**Services required**: `make run-api-server` (port 8080) + `make run-frontend` (port 3000).
Start budget-deepagent (`make run-budget`) for chat and HITL tests.

**DB verification commands** (agent uses these):
```bash
# Connect to Supabase via psql or run via Supabase MCP execute_sql
# Project: jvtrdsrowhsanjmyymro

-- Last 5 runs
SELECT id, agent, status, cost_usd, total_tokens, started_at FROM runs ORDER BY started_at DESC LIMIT 5;

-- Last 5 HOTL logs
SELECT id, agent, is_read, cost_usd, total_tokens, created_at FROM hotl_logs ORDER BY created_at DESC LIMIT 5;

-- All HITL items
SELECT id, agent, status, created_at FROM hitl_items ORDER BY created_at DESC LIMIT 10;

-- Schedules
SELECT agent, name, cron_expr, enabled FROM schedules;

-- All threads
SELECT DISTINCT thread_id, agent FROM chat_history ORDER BY created_at DESC LIMIT 10;
```

---

## 1. Auth

**[James]**
1. Open `http://localhost:3000` — should redirect to `/login`
2. Enter your email, click Send Code
3. Enter the OTP from your email
4. Should land on the dashboard (`/`)

**[Agent: verify]**
- `GET /ok` returns `{"ok": true}` — DB is live
- `GET /me` with valid Bearer returns `{"tenant_id": "4efdeb00-...", "user_id": "<uid>"}`
- No 500 errors in API server stdout

---

## 2. Dashboard — Agent Cards

**[James]**
1. On the dashboard, confirm all agent cards render (Gmail, Calendar, Budget, Job Chain)
2. Each card shows status (RUNNING/DOWN), accent color, and description
3. Cards with recent failed runs show a red error badge

**[Agent: verify]**
- `GET /agents` returns array with `status`, `accentColor`, `schedules[]` for each
- Circuit breaker field `circuit` present in response

---

## 3. Chat — Streaming + Thread Persistence

**[James]**
1. Click the Budget Agent card → opens `/agent/budget-deepagent`
2. Send a message: `"What is my current budget status?"`
3. Watch the response stream in — should see tokens appear live
4. Reload the page
5. The conversation history should reload automatically (not blank)
6. Use the thread dropdown → click `+ New conversation`
7. Send another message in the new thread
8. Switch back to Thread 1 — original messages should still be there

**[Agent: verify]**
```sql
SELECT thread_id, role, content, created_at FROM chat_history
WHERE agent = 'budget-deepagent' ORDER BY created_at DESC LIMIT 10;
```
- Two distinct `thread_id` values exist for budget-deepagent
- Messages from both threads are persisted
- API server logs show `POST /agents/budget-deepagent/run` → 200

---

## 4. HOTL Logs — Run Summary Pipeline

**[James]**
1. After the chat run completes, navigate to `/logs`
2. A log entry should appear for the budget-deepagent run
3. Expand the log — it should show tool calls and a summary
4. The entry should show cost (if Gemini reported tokens)
5. Click "Mark read" — entry grays out

**[Agent: verify]**
```sql
SELECT id, agent, summary, cost_usd, total_tokens, is_read, created_at
FROM hotl_logs WHERE agent = 'budget-deepagent' ORDER BY created_at DESC LIMIT 3;
```
- `summary` is a non-null JSON blob with `overview`, `tools` fields
- `is_read` flips to `true` after James marks it read
- Cost/token fields may be null (Gemini Flash doesn't always report tokens via OpenRouter)

---

## 5. HITL — Human-in-the-Loop Approve/Reject

**[James]**
1. In chat with budget-deepagent, send: `"Reallocate $200 from dining to travel budget"`
2. The agent should call `request_human_approval` and pause
3. Navigate to `/hitl` — a pending approval request should appear
4. Read the payload, click **Approve** (or **Reject**)
5. The agent's chat response should resume with the decision

**[Agent: verify]**
```sql
SELECT id, agent, status, comment, payload, created_at
FROM hitl_items ORDER BY created_at DESC LIMIT 3;
```
- Item starts as `pending`, transitions to `approved` or `rejected`
- API server logs show the budget-agent polling `GET /hitl/{id}` every 30s
- After resolution, chat shows `"Human decision: approved/rejected. Human Comment: ..."`

---

## 6. Schedules — Create, Enable, Trigger, Delete

**[James]**
1. Navigate to `/schedules`
2. Page should be empty (no schedules yet) with an "Add schedule" button
3. Click **Add schedule** → modal opens
4. Fill in:
   - Agent: Budget Agent
   - Name: `test-daily`
   - Cron: `0 9 * * *` (Daily 9am preset)
   - Task prompt: `"Run your daily budget check-in"`
   - Toggle to enabled
5. Click **Create schedule** — modal closes, schedule appears in list
6. Click the **Run** (play) button to trigger immediately
7. Click the **Edit** (pencil) button → change cron to `*/30 * * * *`, save
8. Click the **Delete** (trash) button → schedule removed

**[Agent: verify]**
```sql
-- After step 5 (created):
SELECT agent, name, cron_expr, enabled, task_prompt FROM schedules WHERE name = 'test-daily';

-- After step 6 (triggered):
SELECT id, agent, status, started_at FROM runs WHERE agent = 'budget-deepagent' ORDER BY started_at DESC LIMIT 2;

-- After step 7 (edited):
SELECT cron_expr FROM schedules WHERE name = 'test-daily';  -- should be */30 * * * *

-- After step 8 (deleted):
SELECT COUNT(*) FROM schedules WHERE name = 'test-daily';  -- should be 0
```
- APScheduler logs in API server show `[Scheduler] ...` job registered after step 5
- After manual trigger (step 6), a new `runs` row appears with `status = 'running'` then `'success'`

---

## 7. Run History — Per-Agent Runs Tab

**[James]**
1. On the agent page (`/agent/budget-deepagent`), click the **Run History** tab in the right panel
2. Should list recent runs with status dot, timestamp, cost, token count
3. Runs from chat and scheduled trigger should both appear

**[Agent: verify]**
```sql
SELECT id, status, cost_usd, total_tokens, started_at, ended_at
FROM runs WHERE agent = 'budget-deepagent' ORDER BY started_at DESC LIMIT 5;
```
- `started_at` and `ended_at` both populated for completed runs
- `status` = `success` for clean runs, `error` if agent crashed

---

## 8. Agent Memory — AGENTS.md Editor

**[James]**
1. On the agent page, click the **Memory** tab
2. The AGENTS.md content should display (may be empty initially)
3. Click **Edit**, add a line: `- Test entry: added via dashboard`
4. Click **Save** — should show "Saved" briefly
5. Reload the page — the edit should persist

**[Agent: verify]**
```bash
# Check file on disk (not DB):
cat agents/budget-deepagent/skills/AGENTS.md
```
- The edit is persisted to the filesystem file, not the database
- `GET /agents/budget-deepagent/agents-md` returns the updated content

---

## 9. Health Panel — Settings Page

**[James]**
1. Navigate to `/settings`
2. The Services section should show status dots for each service (API, Gmail, Calendar, Budget, Job)
3. With only API + Budget running, API should be green, others red/timeout
4. The "Last checked" timestamp should update every 30 seconds

**[Agent: verify]**
- `GET /api/health` returns `{ services: [{ name, port, status, latency_ms }] }`
- Services with running agents show `"ok"`, others show `"error"` or `"timeout"`
- No authentication errors — health route is internal Next.js, does not need bearer token

---

## 10. Admin Pages

**[James]**
1. Navigate to `/admin`
2. Tenants tab: your tenant row should be visible
3. Agents tab: all registered agents (from agents.yaml) should show
4. Users tab: your user row linked to your tenant
5. Try creating a second tenant (for testing multi-tenant isolation)

**[Agent: verify]**
```sql
SELECT id, name FROM tenants;
SELECT name, port, enabled FROM agent_registry;
SELECT user_id, tenant_id FROM user_tenants;
```
- Admin pages return 403 for non-James tenants
- `GET /admin/agents` populates from the live `agent_registry` table

---

## 11. Nav Counts — Badge Updates

**[James]**
1. With pending HITL items, check the nav sidebar — should show a red badge on HITL
2. With unread HOTL logs, the Logs nav item should show a count
3. After reading all logs and resolving all HITL items, badges should clear

**[Agent: verify]**
```sql
SELECT
  (SELECT COUNT(*) FROM hitl_items WHERE status = 'pending') AS hitl_pending,
  (SELECT COUNT(*) FROM hotl_logs WHERE is_read = false) AS hotl_unread;
```
- `GET /nav-counts` returns `{ hitl: N, hotl: N }` matching the DB counts

---

## What Passing Looks Like

All 11 sections complete with no 500s in API logs, no 401/403 on authenticated routes,
and DB state matching expected values at each step.

Known acceptable gaps (not blocking):
- Cost/token fields may be null for OpenRouter Gemini runs (OpenRouter doesn't always forward usage)
- Health panel shows DOWN for agents not currently running — that's correct
- Job Chain agent may not start cleanly if LangGraph server has issues — skip that agent's tests

---

## After Testing

When all sections pass, the next steps are:
1. `git push origin feat/supabase-auth`
2. Update PR #16 description with a summary of what was verified
3. Merge to `main`
4. James can begin building the next agent using `agents/_template/` as the scaffold

**Security items to address post-merge** (from security review, not blocking for merge):
- C-04: Add `_require_admin()` to `POST /registry/reload`
- C-03: Add tenant check to `GET/PUT /agents/{name}/agents-md`
- I-02: Add auth check to `GET /api/logs/[name]/route.ts`
- I-03: Move `JAMES_TENANT_ID` to env var `ADMIN_TENANT_ID`
