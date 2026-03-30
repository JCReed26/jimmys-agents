-- Migration 007: Rename workflow → name in schedules.
-- "Workflow" was confusing — these are just named scheduled calls to an agent.
-- Keeps multi-schedule-per-agent support; uniqueness is (tenant_id, agent, name).

ALTER TABLE schedules RENAME COLUMN workflow TO name;
