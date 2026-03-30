-- name: nav_counts
SELECT
  (SELECT COUNT(*) FROM hitl_items WHERE tenant_id=$1 AND status='pending') AS hitl,
  (SELECT COUNT(*) FROM hotl_logs  WHERE tenant_id=$1 AND is_read=false)    AS hotl_unread
