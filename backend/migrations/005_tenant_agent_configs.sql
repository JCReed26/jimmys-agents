-- Per-tenant per-agent configuration store (rate limits, custom prompts, etc.)
CREATE TABLE IF NOT EXISTS tenant_agent_configs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent      TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, agent)
);
CREATE INDEX IF NOT EXISTS idx_tenant_agent_configs ON tenant_agent_configs(tenant_id, agent);
