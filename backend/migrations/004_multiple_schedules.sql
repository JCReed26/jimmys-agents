-- backend/migrations/004_multiple_schedules.sql
-- Allow multiple schedules per agent+tenant by dropping the UNIQUE constraint
-- and defining a new logical uniqueness on (tenant_id, agent, workflow).
-- In practice, since 'workflow' is used to identify the scheduled action (and forapscheduler job IDs),
-- we need to make workflow distinct or generate UUIDs. 
-- For now, the user requested "multiple schedules for the same agent".
-- We will replace the unique constraint with a UUID identity.

-- Drop the existing unique constraint
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_tenant_id_agent_workflow_key;
