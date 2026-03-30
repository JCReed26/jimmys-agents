-- name: list_tenant_agents
SELECT ar.name, ar.display_name, ar.port, ar.accent_color, ta.status, ta.archived_at
FROM tenant_agents ta
JOIN agent_registry ar ON ta.agent_registry_id = ar.id
WHERE ta.tenant_id=$1 AND ar.is_globally_active=true AND ta.status='active'
ORDER BY ar.port

-- name: list_tenant_agents_with_archived
SELECT ar.name, ar.display_name, ar.port, ar.accent_color, ta.status, ta.archived_at
FROM tenant_agents ta
JOIN agent_registry ar ON ta.agent_registry_id = ar.id
WHERE ta.tenant_id=$1 AND ar.is_globally_active=true
ORDER BY ar.port

-- name: get_agent_memory
SELECT content FROM agent_memory WHERE tenant_id=$1 AND agent=$2

-- name: upsert_agent_memory
INSERT INTO agent_memory (tenant_id, agent, content, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (tenant_id, agent) DO UPDATE SET content=$3, updated_at=now()

-- name: get_agent_rules
SELECT content FROM agent_rules WHERE tenant_id=$1 AND agent=$2

-- name: upsert_agent_rules
INSERT INTO agent_rules (tenant_id, agent, content, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (tenant_id, agent) DO UPDATE SET content=$3, updated_at=now()

-- name: get_agent_config
SELECT config FROM tenant_agent_configs WHERE tenant_id=$1 AND agent=$2

-- name: upsert_agent_config
INSERT INTO tenant_agent_configs (tenant_id, agent, config, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (tenant_id, agent)
DO UPDATE SET config=$3, updated_at=now()
RETURNING config

-- For global search:
-- name: search_memory
SELECT agent, content FROM agent_memory WHERE tenant_id=$1

-- name: search_rules
SELECT agent, content FROM agent_rules WHERE tenant_id=$1
