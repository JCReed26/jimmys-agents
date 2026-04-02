-- name: upsert
INSERT INTO schedules (agent, name, cron_expr, enabled, task_prompt, thread_id)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (agent, name)
DO UPDATE SET cron_expr=$3, enabled=$4, task_prompt=$5,
              thread_id=COALESCE(schedules.thread_id, $6)
RETURNING *

-- name: delete
DELETE FROM schedules WHERE agent=$1 AND name=$2

-- name: list_all
SELECT * FROM schedules

-- name: list_by_agent
SELECT * FROM schedules WHERE agent=$1

-- name: load_all_enabled
SELECT * FROM schedules WHERE enabled=true

-- name: set_enabled
UPDATE schedules SET enabled=$1 WHERE agent=$2 AND name=$3

-- Load all schedules (scheduler reads all, checks enabled in Python):
-- name: load_all
SELECT agent, name, cron_expr, enabled, task_prompt, thread_id::text FROM schedules
