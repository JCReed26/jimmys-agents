# E2E Feature Verification Checklist

**How this works**: James performs every step marked `[James]`. The agent verifying the session
checks logs and DB for each step marked `[Agent: verify]`. James does not look at logs — that's
the agent's job.

**Services required**: `make run-api-server` (port 8080) + `make run-frontend` (port 3000).
Start budget-deepagent (`make run-budget`) for chat and HITL tests.

**DB verification commands** (agent uses Supabase MCP `execute_sql`):
```sql
-- Project: jvtrdsrowhsanjmyymro

-- Last 5 runs
SELECT id, agent, status, cost_usd, token_count, started_at FROM run_records ORDER BY started_at DESC LIMIT 5;

-- Last 5 HOTL logs
SELECT id, agent, is_read, cost_usd, total_tokens, created_at FROM hotl_logs ORDER BY created_at DESC LIMIT 5;

-- All HITL items
SELECT id, agent, status, created_at FROM hitl_items ORDER BY created_at DESC LIMIT 10;

-- Schedules
SELECT agent, name, cron_expr, enabled FROM schedules;

-- Tenants + users
SELECT t.name, ut.user_id FROM tenants t JOIN user_tenants ut ON t.id = ut.tenant_id;
```

> Note: LangGraph manages thread state internally. There is no `chat_history` table — verify
> thread persistence by checking that a run record exists and the chat UI reloads history.

---

## 1. Auth

**[James]**
1. Open `http://localhost:3000` — should redirect to `/login`
2. Enter your email, click Send Code
3. Enter the OTP from your email
4. Should land on the dashboard (`/`)

**[Agent: verify]**
- `GET /ok` returns `{"ok": true}` — DB and gateway are live
- `GET /me` with valid Bearer returns `{"tenant_id": "...", "user_id": "...", "tenant_name": "..."}`
- No 500 errors in API server stdout

---

## 2. Dashboard — Agent Cards

**[James]**
1. Dashboard shows agent cards for all agents assigned to your tenant
2. Each card shows status (RUNNING/DOWN), accent color dot, and description
3. Cards with recent failed runs show a red error indicator

**[Agent: verify]**
- `GET /agents` returns objects with `status`, `accentColor`, `circuit`, `schedules[]` for each
- `circuit` field is present (`closed` for healthy agents)

---

## 3. Chat — Streaming, Thread Persistence, Abort Safety

**[James]**
1. Click the Budget Agent card → opens `/agent/budget-deepagent`
2. Send: `"What is my current budget status?"`
3. Watch the response stream in — tokens should appear live
4. While the agent is still responding, send a second message immediately
   — the first response should stop, the second should start cleanly (AbortController fix)
5. After a run completes, reload the page
6. Conversation history should reload automatically (no blank flash — race fix)
7. Use the thread dropdown → click `+ New conversation`
8. Send a message in the new thread
9. Switch back to Thread 1 — original messages should still be there

**[Agent: verify]**
```sql
-- Two distinct run records for budget-deepagent
SELECT id, status, started_at FROM run_records
WHERE agent = 'budget-deepagent' ORDER BY started_at DESC LIMIT 5;
```
- Run records exist for both threads
- `status = 'done'` for clean completions; `status = 'interrupted'` for mid-stream disconnects
- API server logs show `POST /agents/budget-deepagent/run` → 200

---

## 4. HOTL Logs — Run Summary Pipeline

**[James]**
1. After a chat run completes, navigate to `/logs`
2. A log entry should appear for the budget-deepagent run
3. Entry shows tool calls, summary, and cost (may be null for OpenRouter Gemini)
4. Click "Mark read" — entry grays out / unread badge clears

**[Agent: verify]**
```sql
SELECT id, agent, summary, cost_usd, total_tokens, is_read, created_at
FROM hotl_logs WHERE agent = 'budget-deepagent' ORDER BY created_at DESC LIMIT 3;
```
- `summary` is a non-null JSONB blob with `overview` and `tools` fields
- `is_read` flips to `true` after James marks it read
- Cost/token fields may be null (OpenRouter Gemini doesn't always forward usage metadata)

---

## 5. HITL — Human-in-the-Loop Approve/Reject

**[James]**
1. In chat with budget-deepagent, send: `"Reallocate $200 from dining to travel budget"`
2. The agent should call `request_human_approval` and pause
3. Navigate to `/inbox` — a pending approval request should appear
4. Read the payload, click **Approve** (or **Reject**)
5. The agent's chat response should resume with the decision

**[Agent: verify]**
```sql
SELECT id, agent, status, payload, created_at
FROM hitl_items ORDER BY created_at DESC LIMIT 3;
```
- Item starts as `pending`, transitions to `approved` or `rejected` after step 4
- API server logs show the budget-agent polling `GET /hitl/{id}` every ~30s
- After resolution, chat shows the agent acknowledging the decision

---

## 6. Schedules — Create, Enable, Trigger, Delete

**[James]**
1. Navigate to `/schedules`
2. Click **Add schedule** → modal opens
3. Fill in:
   - Agent: Budget Agent
   - Name: `test-daily`
   - Cron: `0 9 * * *` (Daily 9am preset)
   - Task prompt: `"Run your daily budget check-in"`
   - Toggle to enabled
4. Click **Create** — schedule appears in list
5. Click the **Run** (play) button to trigger immediately
6. Watch the schedule trigger a live run → check `/logs` for new HOTL entry
7. Click **Edit** (pencil) → change cron to `*/30 * * * *`, save
8. Enter an invalid cron like `not-a-cron`, save → API server logs should show a warning (not a crash)
9. Click **Delete** (trash) → schedule removed

**[Agent: verify]**
```sql
-- After step 4 (created):
SELECT agent, name, cron_expr, enabled, task_prompt FROM schedules WHERE name = 'test-daily';

-- After step 5 (triggered):
SELECT id, agent, status, started_at FROM run_records
WHERE agent = 'budget-deepagent' ORDER BY started_at DESC LIMIT 2;

-- After step 7 (edited):
SELECT cron_expr FROM schedules WHERE name = 'test-daily';
-- Should be: */30 * * * *

-- After step 9 (deleted):
SELECT COUNT(*) FROM schedules WHERE name = 'test-daily';
-- Should be: 0
```
- API server stdout shows `[Scheduler] ...` job registered after step 4
- After manual trigger (step 5), a new `run_records` row appears with `status = 'running'` then `'done'`
- Invalid cron in step 8 produces `WARNING` in API server logs, not a 500

---

## 7. Run History — Per-Agent Runs Tab

**[James]**
1. On the agent page (`/agent/budget-deepagent`), click the **Run History** tab in the right panel
2. Should list recent runs with status badge, timestamp, cost, token count
3. Runs from both chat and the scheduled trigger should appear

**[Agent: verify]**
```sql
SELECT id, status, cost_usd, token_count, started_at, finished_at
FROM run_records WHERE agent = 'budget-deepagent' ORDER BY started_at DESC LIMIT 5;
```
- `started_at` and `finished_at` both populated for completed runs
- `status = 'done'` for clean runs, `status = 'error'` if agent crashed, `status = 'interrupted'` for disconnects

---

## 8. Agent Memory — AGENTS.md Editor

**[James]**
1. On the agent page, click the **Memory** tab
2. AGENTS.md content displays (may be empty initially)
3. Click **Edit**, add a line: `- Test entry: added via dashboard`
4. Notice the amber **unsaved** badge appears while editing (unsaved-changes fix)
5. Try switching browser tabs while editing — you should see a browser "leave site?" warning
6. Return, click **Save** — "Saved" briefly appears, badge disappears
7. Reload the page — the edit persists

**[Agent: verify]**
```bash
cat agents/budget-deepagent/skills/AGENTS.md
```
- Edit is persisted to the filesystem file
- `GET /agents/budget-deepagent/agents-md` returns the updated content

---

## 9. Health Panel — Settings Page

**[James]**
1. Navigate to `/settings`
2. Services section shows status dots for each service
3. With only API + Budget running, API shows green, others show red/timeout
4. "Last checked" timestamp updates every 30s

**[Agent: verify]**
- `GET /ok` returns `{"ok": true}`
- Services with running agents return 200 from their `/assistants` endpoint

---

## 10. Admin Pages — CRUD + Security

**[James]**
1. Navigate to `/admin` — should load without error (serialize() crash fix)
2. **Tenants tab**: your tenant row is visible; try creating a second test tenant
3. **Agents tab**: all registered agents show; try assigning the budget-agent to the new tenant
4. **Users tab**: your user row linked to your tenant; try adding a user by UUID

**[Agent: verify]**
```sql
SELECT id, name, is_active FROM tenants;
SELECT name, port, is_globally_active FROM agent_registry;
SELECT user_id, tenant_id FROM user_tenants;
```
- `GET /admin/tenants` returns 200 (was crashing with NameError before the serialize() fix)
- `POST /admin/tenants` creates and returns a new tenant dict (not a NameError crash)
- `GET /admin/agents` returns agent registry list (not a NameError crash)

**[James — security test]**
5. Open a fresh incognito tab, log in as a **non-admin user** (or use curl without a token):
   - `GET /admin/tenants` → should return 403
   - `POST /registry/reload` → should return 403 (registry/reload auth fix)

---

## 11. Security — Tenant Isolation on agents-md

**[James]** (requires two tenants with different agent assignments)

1. Log in as James (admin tenant)
2. `GET /agents/budget-deepagent/agents-md` → should return content (admin bypass)
3. Log in as a test tenant user who does NOT have budget-deepagent assigned
4. `GET /agents/budget-deepagent/agents-md` → should return **403** (tenant check fix)

**[Agent: verify]**
```sql
-- Confirm the test tenant does NOT have budget-deepagent:
SELECT ta.*, ar.name as agent_name
FROM tenant_agents ta JOIN agent_registry ar ON ta.agent_registry_id = ar.id
WHERE ta.tenant_id = '<test_tenant_id>';
```

---

## 12. Nav Counts — Badge Updates

**[James]**
1. With pending HITL items, sidebar shows red badge on Inbox
2. With unread HOTL logs, Logs nav shows a count
3. After reading all logs and resolving all HITL items, badges clear

**[Agent: verify]**
```sql
SELECT
  (SELECT COUNT(*) FROM hitl_items WHERE status = 'pending') AS hitl_pending,
  (SELECT COUNT(*) FROM hotl_logs WHERE is_read = false) AS hotl_unread;
```
- `GET /nav-counts` returns `{ hitl: N, hotl: N }` matching the DB counts

---

## 13. Error Boundaries — Crash Recovery

**[James]**
1. On the agent page, open browser DevTools console
2. There should be no uncaught React render errors from normal usage
3. If a component does crash, a fallback UI with "Something went wrong" + "Try again" button should appear
   (not a blank white page)

---

## What Passing Looks Like

All 13 sections complete with:
- No 500s in API server logs
- No 401/403 on authenticated routes (except intentional security tests in §10–11)
- DB state matching expected values at each step
- `status = 'interrupted'` (not `'running'`) for any mid-stream disconnected runs

**Known acceptable gaps (not blocking):**
- Cost/token fields may be null for OpenRouter Gemini runs
- Health panel shows DOWN for agents not running — correct behavior
- Job Chain agent may not start cleanly if its LangGraph server has issues — skip that agent

---

## After Testing

When all sections pass:
1. Harness is production-solid — begin building new agents
2. Use `agents/_template/` as scaffold, `agents/budget-deepagent/` as reference pattern
3. Register new agents in `agents.yaml` + `frontend/src/lib/agents.ts` + `Makefile`
4. Run `POST /registry/reload` to hot-load without restart

**Remaining post-merge items (not blocking for agent development):**
- Add Postgres RLS before onboarding real clients (see `docs/issues.md` I-04)
- Update cost estimate in `_estimate_cost()` if using non-Gemini models per agent (I-05)
