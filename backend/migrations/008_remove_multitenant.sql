-- 008_remove_multitenant.sql
-- Removes multi-tenant architecture. Single-user system: no tenants, user_tenants, or tenant_agents.

BEGIN;

-- Drop tenant mapping tables (CASCADE removes FK constraints on dependent tables)
DROP TABLE IF EXISTS tenant_agents CASCADE;
DROP TABLE IF EXISTS user_tenants CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Drop tenant_id column from all runtime tables
ALTER TABLE hitl_items DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE hotl_logs DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE run_records DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE schedules DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE agent_memory DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE agent_rules DROP COLUMN IF EXISTS tenant_id;

-- Rename tenant_agent_configs → agent_configs (no tenant scope)
ALTER TABLE tenant_agent_configs RENAME TO agent_configs;
ALTER TABLE agent_configs DROP COLUMN IF EXISTS tenant_id;

-- Drop old tenant-scoped indexes
DROP INDEX IF EXISTS idx_hitl_tenant_status;
DROP INDEX IF EXISTS idx_hitl_tenant_agent;
DROP INDEX IF EXISTS idx_hotl_tenant_read;
DROP INDEX IF EXISTS idx_hotl_tenant_agent;
DROP INDEX IF EXISTS idx_runs_tenant_agent;
DROP INDEX IF EXISTS idx_schedules_tenant_agent;
DROP INDEX IF EXISTS idx_tenant_agent_configs;

-- Drop old unique constraints that included tenant_id, re-add without it
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_tenant_agent_workflow_key;
ALTER TABLE schedules ADD UNIQUE (agent, name);

ALTER TABLE agent_memory DROP CONSTRAINT IF EXISTS agent_memory_tenant_id_agent_key;
ALTER TABLE agent_memory ADD UNIQUE (agent);

ALTER TABLE agent_rules DROP CONSTRAINT IF EXISTS agent_rules_tenant_id_agent_key;
ALTER TABLE agent_rules ADD UNIQUE (agent);

ALTER TABLE agent_configs DROP CONSTRAINT IF EXISTS tenant_agent_configs_tenant_id_agent_key;
ALTER TABLE agent_configs ADD UNIQUE (agent);

-- Re-add useful indexes (without tenant scope)
CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_items(status);
CREATE INDEX IF NOT EXISTS idx_hitl_agent ON hitl_items(agent);
CREATE INDEX IF NOT EXISTS idx_hotl_read ON hotl_logs(is_read);
CREATE INDEX IF NOT EXISTS idx_hotl_agent ON hotl_logs(agent);
CREATE INDEX IF NOT EXISTS idx_runs_agent ON run_records(agent);
CREATE INDEX IF NOT EXISTS idx_schedules_agent ON schedules(agent);

COMMIT;
