-- Tenants
CREATE TABLE tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Maps Supabase auth users to tenants
CREATE TABLE user_tenants (
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tenant_id)
);

-- James-maintained master list of agent implementations
CREATE TABLE agent_registry (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT UNIQUE NOT NULL,
  display_name       TEXT NOT NULL,
  port               INTEGER NOT NULL,
  accent_color       TEXT,
  is_globally_active BOOLEAN NOT NULL DEFAULT true
);

-- Per-tenant agent instances
CREATE TABLE tenant_agents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_registry_id UUID NOT NULL REFERENCES agent_registry(id) ON DELETE CASCADE,
  status            TEXT NOT NULL DEFAULT 'active',
  archived_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent_registry_id)
);

-- HITL (Human-in-the-loop) approval items
CREATE TABLE hitl_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  item_type   TEXT NOT NULL,
  payload     JSONB NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX idx_hitl_tenant_status ON hitl_items(tenant_id, status);
CREATE INDEX idx_hitl_tenant_agent  ON hitl_items(tenant_id, agent);

-- HOTL (Human-on-the-loop) post-run summaries
CREATE TABLE hotl_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL,
  run_id     TEXT NOT NULL,
  summary    JSONB NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_hotl_tenant_read  ON hotl_logs(tenant_id, is_read);
CREATE INDEX idx_hotl_tenant_agent ON hotl_logs(tenant_id, agent);

-- Run execution records
CREATE TABLE run_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  run_id      TEXT UNIQUE NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'running',
  token_count INTEGER DEFAULT 0,
  cost_usd    NUMERIC(10,6) DEFAULT 0,
  error_msg   TEXT
);
CREATE INDEX idx_runs_tenant_agent ON run_records(tenant_id, agent);

-- Agent schedules
CREATE TABLE schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent       TEXT NOT NULL,
  workflow    TEXT NOT NULL DEFAULT 'default',
  cron_expr   TEXT NOT NULL DEFAULT '0 */30 * * *',
  enabled     BOOLEAN NOT NULL DEFAULT true,
  task_prompt TEXT,
  last_run    TIMESTAMPTZ,
  next_run    TIMESTAMPTZ,
  thread_id   TEXT,
  UNIQUE (tenant_id, agent, workflow)
);
CREATE INDEX idx_schedules_tenant_agent ON schedules(tenant_id, agent);

-- Agent self-written memory (per tenant, replaces MEMORY.md on filesystem)
CREATE TABLE agent_memory (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent)
);

-- Agent self-generated rules (per tenant, replaces RULES.md on filesystem)
CREATE TABLE agent_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent)
);
