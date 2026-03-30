-- Migration 004 dropped the UNIQUE constraint on schedules but never re-added it.
-- APScheduler job IDs are built from (tenant_id, agent, workflow), so this
-- combination must remain unique or duplicate jobs will silently overwrite each other.
-- Re-add the constraint. If duplicate rows exist, this will fail — clean them first.
ALTER TABLE schedules
  ADD CONSTRAINT schedules_tenant_agent_workflow_key
  UNIQUE (tenant_id, agent, workflow);
