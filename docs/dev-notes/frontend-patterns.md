# Frontend Patterns

> Read this before touching anything in `frontend/src/`.

---

## All API Calls Go Through Next.js Proxy Routes

The browser **never calls the gateway directly**. Every API call goes through a Next.js route handler that:

1. Calls `getServerAccessToken()` (server-side Supabase session)
2. Attaches `Authorization: Bearer {token}` header
3. Proxies to `${AGENT_API_URL}/{gateway_path}`

```
Browser → /api/chat/{agent}    → :8080/agents/{agent}/run
Browser → /api/hitl            → :8080/hitl
Browser → /api/hotl            → :8080/hotl
Browser → /api/runs/{agent}    → :8080/runs?agent={agent}
Browser → /api/agents-md/{name}→ :8080/agents/{name}/agents-md
```

**Adding a new proxy route**: create `frontend/src/app/api/{path}/route.ts`. Pattern to copy from:
`frontend/src/app/api/hitl/route.ts`

---

## AG-UI Protocol (Chat)

The chat hook (`useAgentChat.ts`) sends a POST to `/api/chat/{agent}` and reads the SSE response as AG-UI events. These events are emitted by the gateway's `StreamTranslator`.

Key event types the frontend handles:

| Event | What it means |
|---|---|
| `TEXT_MESSAGE_START` | New message starting |
| `TEXT_MESSAGE_CONTENT` | Text chunk (streaming) |
| `TEXT_MESSAGE_END` | Message complete |
| `TOOL_CALL_START` | Agent called a tool |
| `TOOL_CALL_ARGS_DELTA` | Tool arguments streaming |
| `TOOL_CALL_END` | Tool call complete |
| `RUN_FINISHED` | Entire run complete |
| `RUN_ERROR` | Run failed |

The hook renders `TEXT_MESSAGE_CONTENT` chunks in real time. Tool calls appear as collapsed cards below the message. Read `docs/ag-ui-api.md` for the full protocol spec.

---

## Thread Management

Threads are stored in `localStorage` per agent. Key format: `jimmys-agents:threads:{agent}`.

```typescript
// Storage format (max 10 threads kept)
[
  { id: "thread-{tenant_id}-budget-agent-{uuid}", label: "Thread 1", created_at: "2026-03-28T..." },
  { id: "thread-{tenant_id}-budget-agent-{uuid}", label: "Thread 2", created_at: "2026-03-29T..." },
]
```

On mount, `useAgentChat` reads the stored thread array, selects the most recent thread, and calls `GET /api/chat/{agent}?thread_id={id}` to load history. If history returns empty, it shows the "Start a conversation" empty state.

**Thread ID format is enforced by the gateway** — it must be `thread-{tenant_id}-{agent}-{uuid4}`. The gateway's history endpoint validates the prefix. Never generate bare UUIDs.

---

## Auth Client Usage

```typescript
// Server-side (API routes, Server Components)
import { getServerAccessToken, bearerHeaders } from "@/lib/auth-server";
const token = await getServerAccessToken();
if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

// Client-side (client components)
import { createClient } from "@/lib/supabase";
const supabase = createClient();
```

Never call `getServerAccessToken()` from client components — it uses server-only Supabase cookies. Never use `createClient()` in server-side proxy routes — it won't have the right session context.

---

## Component Conventions

The dashboard uses **shadcn/ui** throughout. Key patterns:

- `Card` + `CardHeader` + `CardContent` — panels and sections
- `Tabs` + `TabsList` + `TabsTrigger` + `TabsContent` — the agent detail page tabs
- `Skeleton` — loading states (always show while fetching, never show a spinner alone)
- `Badge` — status indicators, count badges in nav
- `Button variant="ghost"` — inline actions (edit, delete)

Accent colors live as CSS variables: `var(--agent-gmail)`, `var(--agent-calendar)`, `var(--agent-budget)`, `var(--agent-job-chain)`. Use `style={{ color: accentColor }}` for dynamic agent colors. Never hardcode `#00ff88` etc. in component JSX.

---

## Agent Detail Page Tabs

The agent detail page (`/agent/[name]`) has four tabs. Loading is lazy — panels only fetch when first activated (`panelLoaded` set tracks this).

| Tab | Key | What fetches | When |
|---|---|---|---|
| Chat | `chat` | Chat history via `useAgentChat` hook | Always (default tab) |
| Runs | `runs` | `GET /api/runs/{name}` | On first activation |
| Schedule | `schedule` | `GET /api/schedules?agent={name}` | On first activation |
| Memory | `memory` | `GET /api/agents-md/{name}` | On first activation |

---

## Gotchas

- **`await` the Supabase signOut** — `handleSignOut` in `layout-shell.tsx` must `await supabase.auth.signOut()` before `router.push("/login")`. Without the await, the session may still be active when the login page loads.
- **SSE streaming with `ReadableStream`** — the chat proxy at `/api/chat/{agent}/route.ts` uses `TransformStream` to pipe the gateway's SSE response. Any error in the transform will silently kill the stream. Always add try/catch around the transform logic.
- **`AGENT_API_URL` env var** — all proxy routes use `process.env.AGENT_API_URL ?? "http://localhost:8080"`. Set this in `.env.local` for local dev. In production (Vercel), set via environment variables.
- **`NEXT_PUBLIC_SUPABASE_URL` vs `SUPABASE_URL`** — `NEXT_PUBLIC_` vars are browser-visible. The anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is browser-safe. The service role key must never be `NEXT_PUBLIC_`.
