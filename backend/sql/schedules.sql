-- name: upsert
INSERT INTO schedules (tenant_id, agent, name, cron_expr, enabled, task_prompt, thread_id)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (tenant_id, agent, name)
DO UPDATE SET cron_expr=$4, enabled=$5, task_prompt=$6,
              thread_id=COALESCE(schedules.thread_id, $7)
RETURNING *

-- name: delete
DELETE FROM schedules WHERE tenant_id=$1 AND agent=$2 AND name=$3

-- name: list_all
SELECT * FROM schedules WHERE tenant_id=$1

-- name: list_by_agent
SELECT * FROM schedules WHERE tenant_id=$1 AND agent=$2

-- name: load_all_enabled
SELECT * FROM schedules WHERE enabled=true

-- name: set_enabled
UPDATE schedules SET enabled=$1 WHERE tenant_id=$2 AND agent=$3 AND name=$4

-- Load all schedules (scheduler reads all, checks enabled in Python):
-- name: load_all
SELECT tenant_id::text, agent, name, cron_expr, enabled, task_prompt, thread_id::text FROM schedules
