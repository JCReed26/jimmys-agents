-- name: list_active_agents
SELECT name, display_name, port, accent_color
FROM agent_registry
WHERE is_globally_active=true
ORDER BY port

-- name: get_agent_memory
SELECT content FROM agent_memory WHERE agent=$1

-- name: upsert_agent_memory
INSERT INTO agent_memory (agent, content, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (agent) DO UPDATE SET content=$2, updated_at=now()

-- name: get_agent_rules
SELECT content FROM agent_rules WHERE agent=$1

-- name: upsert_agent_rules
INSERT INTO agent_rules (agent, content, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (agent) DO UPDATE SET content=$2, updated_at=now()

-- name: get_agent_config
SELECT config FROM agent_configs WHERE agent=$1

-- name: upsert_agent_config
INSERT INTO agent_configs (agent, config, updated_at)
VALUES ($1, $2, now())
ON CONFLICT (agent)
DO UPDATE SET config=$2, updated_at=now()
RETURNING config

-- For global search:
-- name: search_memory
SELECT agent, content FROM agent_memory

-- name: search_rules
SELECT agent, content FROM agent_rules
