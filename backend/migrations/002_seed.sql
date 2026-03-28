INSERT INTO agent_registry (name, display_name, port, accent_color, is_globally_active) VALUES
  ('gmail-agent',    'Gmail Agent',    8001, '#00ff88', true),
  ('calendar-agent', 'Calendar Agent', 8002, '#00d4ff', true),
  ('budget-agent',   'Budget Agent',   8003, '#a855f7', true),
  ('job-app-chain',  'Job App Chain',  8004, '#f59e0b', true)
ON CONFLICT (name) DO NOTHING;
