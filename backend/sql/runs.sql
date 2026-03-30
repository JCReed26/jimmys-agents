-- name: start_run
INSERT INTO run_records (tenant_id, agent, run_id, started_at)
VALUES ($1, $2, $3, $4)
RETURNING *

-- name: finish_run
UPDATE run_records
SET finished_at=$1, status=$2, token_count=$3, cost_usd=$4, error_msg=$5
WHERE run_id=$6 AND tenant_id=$7
RETURNING *

-- name: list_for_agent
SELECT id, status, cost_usd, token_count AS total_tokens,
       started_at, finished_at AS ended_at, run_id AS langsmith_run_id
FROM run_records
WHERE tenant_id=$1 AND agent=$2
ORDER BY started_at DESC
LIMIT $3

-- name: stats_by_agent
SELECT agent,
       COUNT(*)                      AS runs,
       COALESCE(SUM(token_count), 0) AS tokens,
       COALESCE(SUM(cost_usd), 0)    AS cost
FROM run_records
WHERE tenant_id=$1
GROUP BY agent

-- For agents status page (last 100 runs, all agents):
-- name: list_recent
SELECT id, agent, status, started_at, cost_usd, token_count, error_msg
FROM run_records WHERE tenant_id=$1 ORDER BY started_at DESC LIMIT 100

-- Dynamic list query base (filters appended in Python):
-- name: list_base
SELECT * FROM run_records WHERE tenant_id=$1
