# Auth Flow & Access Control

> Read this before touching `backend/auth_middleware.py`, `backend/api_server.py` admin routes,
> or any frontend auth utilities.

---

## Identities

There are two identities in this system. There is **no roles table** — identity is derived from context.

| Identity | How Determined |
|---|---|
| **Authenticated user** | Valid Supabase JWT → `request.state.user_id = sub` |
| **Internal agent** | `X-Internal-Key: {INTERNAL_API_KEY}` header → `request.state.user_id = "internal"` |

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
  │     │     └── PASS — request.state.user_id = "internal"
  │     └── Value doesn't match → 401
  │
  ├── Authorization: Bearer {jwt} header present?
  │     ├── JWT valid (Supabase RS256, correct issuer/audience)?
  │     │     └── Extract sub (Supabase auth user UID)
  │     │           └── Set request.state.user_id = sub → PASS
  │     └── JWT invalid/expired → 401
  │
  └── No auth header → 401
```

---

## What Each Identity Can Access

### Authenticated User
All standard endpoints:
- `GET /agents` — all agents in registry
- `POST /agents/{name}/run` — start a chat run
- `GET /chat/{agent}/history` — chat history (prefix-validated)
- `GET/POST /hitl`, `POST /hitl/{id}/resolve` — HITL inbox
- `GET/POST /hotl`, `POST /hotl/{id}/read`, `POST /hotl/read-all` — HOTL logs
- `GET/POST /schedules`, `POST /schedules/{agent}/trigger` — schedule management
- `GET /runs` — run history
- `GET /agents/{name}/agents-md`, `PUT /agents/{name}/agents-md` — AGENTS.md editor
- `GET /stats`, `GET /search` — observability
- `GET /nav-counts` — badge counts

### Agent (Internal)
- `POST /hotl` — submit post-run summary
- `POST /hitl` — submit approval request
- `GET /hitl/{id}` — poll for decision

Note: Agents call `http://localhost:8080` directly (not through the Next.js proxy). They never have or need a JWT.

---

## Adding an Agent as an Internal Caller

When a new agent process needs to call the gateway internally:

1. The agent uses `X-Internal-Key: {INTERNAL_API_KEY}` header (from `.env`)
2. No JWT, no user setup needed
3. When posting to `/hotl` or `/hitl`, include `agent_name` in the request body

The agent's agent_name must match the key in `agents.yaml`. No DB setup needed — the agent_registry table is populated from `agents.yaml` on `POST /registry/reload`.

---

## Page-Level Access Control (Frontend)

All protected pages use Next.js middleware at `frontend/src/middleware.ts`. The middleware:
- Calls `getServerAccessToken()` — checks Supabase session
- If no session → redirects to `/login`
- All `/api/*` proxy routes call `getServerAccessToken()` → attach Bearer header

---

## Gotchas

- **`/login` and `/login/verify` are excluded from middleware** — they're public routes. The middleware matcher in `middleware.ts` must not match these paths.
- **CORS preflight must not be auth-gated** — the `_auth` middleware in FastAPI explicitly skips OPTIONS requests. This is intentional.
- **The JWT sub is the Supabase auth UID** — not the email. `request.state.user_id` is always the Supabase `sub` claim.
- **SUPABASE_URL must be set** — `auth_middleware.py` will raise `RuntimeError` at startup if missing (this is intentional — fail fast rather than silently skip issuer verification).
