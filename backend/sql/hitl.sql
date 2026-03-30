-- name: get_item
SELECT * FROM hitl_items WHERE id=$1 AND tenant_id=$2

-- name: create_item
INSERT INTO hitl_items (tenant_id, agent, item_type, payload, created_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING *

-- name: resolve_item
UPDATE hitl_items
SET status=$1, comment=$2, resolved_at=$3
WHERE id=$4 AND tenant_id=$5
RETURNING *

-- Dynamic list query base (filters appended in Python):
-- name: list_base
SELECT * FROM hitl_items WHERE tenant_id=$1
