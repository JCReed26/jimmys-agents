-- name: nav_counts
SELECT
  (SELECT COUNT(*) FROM hitl_items WHERE status='pending') AS hitl,
  (SELECT COUNT(*) FROM hotl_logs  WHERE is_read=false)    AS hotl_unread
