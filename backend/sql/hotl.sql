-- name: create_log
INSERT INTO hotl_logs (tenant_id, agent, run_id, summary, cost_usd, total_tokens, langsmith_run_id, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *

-- name: mark_read
UPDATE hotl_logs SET is_read=true WHERE id=$1 AND tenant_id=$2

-- name: mark_all_read
UPDATE hotl_logs SET is_read=true WHERE tenant_id=$1

-- name: mark_all_read_by_agent
UPDATE hotl_logs SET is_read=true WHERE tenant_id=$1 AND agent=$2

-- name: clear_logs
DELETE FROM hotl_logs WHERE tenant_id=$1

-- Dynamic list query base (filters appended in Python):
-- name: list_base
SELECT * FROM hotl_logs WHERE tenant_id=$1
