-- Add cost/token/trace fields to hotl_logs
ALTER TABLE hotl_logs ADD COLUMN IF NOT EXISTS cost_usd      NUMERIC(10,6) DEFAULT NULL;
ALTER TABLE hotl_logs ADD COLUMN IF NOT EXISTS total_tokens  INTEGER       DEFAULT NULL;
ALTER TABLE hotl_logs ADD COLUMN IF NOT EXISTS langsmith_run_id TEXT       DEFAULT NULL;
