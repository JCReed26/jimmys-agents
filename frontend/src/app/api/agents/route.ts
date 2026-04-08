import { NextResponse } from 'next/server';
import { AGENTS } from '@/lib/agents';

// Returns live status for each agent by hitting its health endpoint directly.
// No gateway, no auth, no DB required.
export async function GET() {
  const results: Record<string, object> = {};

  await Promise.all(
    Object.values(AGENTS).map(async (agent) => {
      let status = 'DOWN';
      try {
        const r = await fetch(`http://localhost:${agent.port}/runs/stream/health`, {
          signal: AbortSignal.timeout(1500),
          cache: 'no-store',
        });
        status = r.ok ? 'RUNNING' : 'DOWN';
      } catch {
        status = 'DOWN';
      }
      results[agent.name] = {
        status,
        enabled: true,
        port: agent.port,
        accentColor: agent.accentColor,
        displayName: agent.displayName,
        circuit: 'CLOSED',
      };
    })
  );

  return NextResponse.json(results);
}
