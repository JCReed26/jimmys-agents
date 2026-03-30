# Auth Flow & Access Control

> Read this before touching `backend/auth_middleware.py`, `backend/api_server.py` admin routes,
> or any frontend auth utilities.

---

## Roles

There are three roles in this system. There is **no roles table** — role is derived from context.

| Role | Identity | How Determined |
|---|---|---|
| **Superadmin** | James (JAMES_TENANT_ID) | `request.state.tenant_id == "4efdeb00-1b23-4031-bc77-555af005a406"` |
| **Tenant User** | Authenticated human | Valid Supabase JWT → `tenant_id` from `user_tenants` table |
| **Agent (Internal)** | Running agent process | `X-Internal-Key: {INTERNAL_API_KEY}` header, no JWT |

---

## Full Auth Decision Tree

```
Incoming request to gateway (:8080)
  │
  ├── OPTIONS request?
  │     └── PASS (CORS preflight — never add auth to OPTIONS)
  │
  ├── X-Internal-Key header present?
  │     ├── Value matches INTERNAL_API_KEY env var?
  │     │     └── PASS — request.state.tenant_id = "internal"
  │     │           (endpoint resolves real tenant from tenant_agents table)
  │     └── Value doesn't match → 401
  │
  ├── Authorization: Bearer {jwt} header present?
  │     ├── JWT valid (Supabase RS256, correct issuer/audience)?
  │     │     └── Extract sub (Supabase auth user UID)
  │     │           └── Look up tenant_id in user_tenants WHERE user_id = sub
  │     │                 ├── Found → PASS — request.state.tenant_id = tenant_id
  │     │                 └── Not found → 403 (auth user not linked to a tenant)
  │     └── JWT invalid/expired → 401
  │
  └── No auth header → 401
```

---

## What Each Role Can Access

### Superadmin (JAMES_TENANT_ID)
All tenant-user endpoints + admin-only endpoints:
- `GET /admin/tenants` — list all tenants
- `POST /admin/tenants` — create tenant
- `GET /admin/agents` — list agent registry
- `POST /admin/tenant-agents` — assign agent to tenant
- `DELETE /admin/tenant-agents` — remove agent from tenant
- `GET /admin/users?tenant_id=` — list users for tenant
- `POST /admin/users` — link user UUID to tenant
- `DELETE /admin/users` — unlink user from tenant

### Tenant User
- `GET /agents` — agents assigned to their tenant (scoped by tenant_id)
- `POST /agents/{name}/run` — start a chat run (scoped)
- `GET /chat/{agent}/history` — chat history (prefix-validated: must match tenant_id)
- `GET/POST /hitl`, `POST /hitl/{id}/resolve` — HITL inbox (scoped)
- `GET/POST /hotl`, `POST /hotl/{id}/read`, `POST /hotl/read-all` — HOTL logs (scoped)
- `GET/POST /schedules`, `POST /schedules/{agent}/trigger` — schedule management (scoped)
- `GET /runs` — run history (scoped)
- `GET /agents/{name}/agents-md`, `PUT /agents/{name}/agents-md` — AGENTS.md editor (scoped)
- `GET /stats`, `GET /search` — observability (scoped)
- `GET /me` — own tenant name
- `GET /nav-counts` — badge counts (scoped)

### Agent (Internal)
- `POST /hotl` — submit post-run summary (tenant resolved from `tenant_agents` by agent_name)
- `POST /hitl` — submit approval request (tenant resolved same way)
- `GET /hitl/{id}` — poll for decision

Note: Agents call `http://localhost:8080` directly (not through the Next.js proxy). They never have or need a JWT.

---

## Tenant Lifecycle

### Creating a New Tenant

1. **In the Admin dashboard** (`/admin` → Tenants tab):
   - Enter a tenant name → click Create
   - The tenant is created in the `tenants` table
   - Tenant is inactive until a user is linked

2. **The user logs in**:
   - User goes to the login page, enters email → receives OTP
   - Supabase creates the `auth.users` record on first login
   - The user can now log in but will see an empty dashboard (no agents assigned yet)

3. **Link the user to the tenant**:
   - In `/admin` → Users tab, select the tenant
   - Enter the user's Supabase auth UUID (copy from Supabase dashboard → Authentication → Users)
   - Click Add

4. **Assign agents to the tenant**:
   - In `/admin` → Agents tab, select the tenant
   - Click Assign next to each agent they should have access to

5. **Test access**:
   - Log in as the user
   - Dashboard should show their assigned agents with status

---

## Adding an Agent as a Role (Internal)

When a new agent process needs to call the gateway internally:

1. The agent uses `X-Internal-Key: {INTERNAL_API_KEY}` header (from `.env`)
2. No JWT, no user setup needed
3. When posting to `/hotl` or `/hitl`, include `agent_name` in the request body
4. The gateway resolves the tenant by looking up `tenant_agents WHERE agent_name = :agent_name`
5. If not found, falls back to JAMES_TENANT_ID

The agent's agent_name must match the key in `agents.yaml`. No DB setup needed — the agent_registry table is populated from `agents.yaml` on `POST /registry/reload`.

---

## Page-Level Access Control (Frontend)

All protected pages use Next.js middleware at `frontend/src/middleware.ts`. The middleware:
- Calls `getServerAccessToken()` — checks Supabase session
- If no session → redirects to `/login`
- All `/api/*` proxy routes call `getServerAccessToken()` → attach Bearer header

The Admin page (`/admin`) has **no frontend gating** — it relies entirely on the backend returning 403 for non-superadmin tenants. The UI renders gracefully (empty state) if the API returns 403.

---

## Gotchas

- **`/login` and `/login/verify` are excluded from middleware** — they're public routes. The middleware matcher in `middleware.ts` must not match these paths.
- **CORS preflight must not be auth-gated** — the `_auth` middleware in FastAPI explicitly skips OPTIONS requests. This is intentional.
- **`user_tenants` NOT `tenants`** — users are linked to tenants via the `user_tenants` join table. The `tenants.auth_user_id` column is a legacy artifact (pre-migration) — do not use it for auth lookup.
- **The JWT sub is the Supabase auth UID** — not the email. Always look up `user_tenants` by `user_id = sub`.
- **SUPABASE_URL must be set** — `auth_middleware.py` will raise `RuntimeError` at startup if missing (this is intentional — fail fast rather than silently skip issuer verification).
