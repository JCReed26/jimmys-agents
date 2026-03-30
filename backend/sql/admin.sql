-- name: get_tenant_name
SELECT name FROM tenants WHERE id=$1

-- Resolve tenant from agent name (used by internal-key HOTL posts):
-- name: get_tenant_id_for_agent
SELECT ta.tenant_id::text
FROM tenant_agents ta
JOIN agent_registry ar ON ta.agent_registry_id = ar.id
WHERE ar.name = $1
LIMIT 1

-- name: list_tenants
SELECT id, name, is_active, created_at FROM tenants ORDER BY created_at DESC

-- name: create_tenant
INSERT INTO tenants (name, is_active) VALUES ($1, true) RETURNING *

-- name: get_tenant
SELECT id, name, is_active, created_at FROM tenants WHERE id=$1

-- name: list_agent_registry
SELECT id, name, display_name, port, accent_color, is_globally_active
FROM agent_registry ORDER BY port

-- name: assign_agent_to_tenant
INSERT INTO tenant_agents (tenant_id, agent_registry_id)
SELECT $1, id FROM agent_registry WHERE name=$2
ON CONFLICT (tenant_id, agent_registry_id) DO UPDATE SET status='active', archived_at=NULL
RETURNING *

-- name: remove_agent_from_tenant
UPDATE tenant_agents SET status='archived', archived_at=now()
WHERE tenant_id=$1
  AND agent_registry_id=(SELECT id FROM agent_registry WHERE name=$2)

-- name: list_tenant_users
SELECT u.id, u.email, ut.tenant_id
FROM auth.users u
JOIN user_tenants ut ON u.id=ut.user_id
WHERE ut.tenant_id=$1

-- name: add_user_to_tenant
INSERT INTO user_tenants (user_id, tenant_id) VALUES ($1, $2)
ON CONFLICT (user_id, tenant_id) DO NOTHING

-- name: remove_user_from_tenant
DELETE FROM user_tenants WHERE user_id=$1 AND tenant_id=$2
