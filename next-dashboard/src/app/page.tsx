"use client";

import { useEffect, useState } from 'react';
import { AgentCard } from '@/components/agent-card';
import { AGENTS, WORKFLOWS } from '@/lib/agents';

export default function Home() {
  const [statuses, setStatuses] = useState<Record<string, any>>({});

  useEffect(() => {
    async function fetchStatuses() {
      try {
        const response = await fetch('/api/agents');
        if (response.ok) {
          const data = await response.json();
          setStatuses(data);
        }
      } catch (error) {
        console.error('Failed to fetch statuses', error);
      }
    }

    fetchStatuses();
    const interval = setInterval(fetchStatuses, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2 className="text-xs font-medium uppercase tracking-wider text-secondary mb-4">Agents</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-16">
        {Object.entries(AGENTS).map(([key, config]) => (
          <AgentCard
            key={key}
            name={key}
            status={statuses[key]?.status || 'IDLE'}
            description={config.description}
            href={`/agent/${key}`}
            icon={config.icon}
            metrics={{
              // Placeholder metrics for now
              avgLatency: '1.2s',
              totalRuns: 42,
              successRate: '98%',
            }}
          />
        ))}
      </div>

      <div className="border-t border-border my-8" />

      <h2 className="text-xs font-medium uppercase tracking-wider text-secondary mb-4">Workflows</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(WORKFLOWS).map(([key, config]) => (
          <AgentCard
            key={key}
            name={key}
            status={statuses[key]?.status === 'RUNNING' ? 'CONNECTED' : statuses[key]?.status || 'IDLE'}
            description={config.description}
            href={`/workflow/${key}`}
            icon={config.icon}
            metrics={{
              lastRun: '2h ago',
              totalRuns: 15,
            }}
          />
        ))}
      </div>
    </div>
  );
}
