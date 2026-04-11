import { NextResponse } from 'next/server';

// Lightweight config — no icon imports so Turbopack doesn't recompile the
// entire lucide-react tree on every health poll.
const AGENT_PORTS: Record<string, { port: number; displayName: string; accentColor: string }> = {
  'template-agent': { port: 8000, displayName: 'Template', accentColor: '#6366f1' },
  'gmail-agent':    { port: 8001, displayName: 'Gmail',    accentColor: '#00ff88' },
  'calendar-agent': { port: 8002, displayName: 'Calendar', accentColor: '#00d4ff' },
  'budget-agent':   { port: 8003, displayName: 'Budget',   accentColor: '#a855f7' },
};

export async function GET() {
  const results: Record<string, object> = {};

  await Promise.all(
    Object.entries(AGENT_PORTS).map(async ([name, cfg]) => {
      let status = 'DOWN';
      try {
        const r = await fetch(`http://localhost:${cfg.port}/ok`, {
          signal: AbortSignal.timeout(1500),
          cache: 'no-store',
        });
        status = r.ok ? 'RUNNING' : 'DOWN';
      } catch {
        status = 'DOWN';
      }
      results[name] = {
        status,
        enabled: true,
        port: cfg.port,
        accentColor: cfg.accentColor,
        displayName: cfg.displayName,
        circuit: 'CLOSED',
      };
    })
  );

  return NextResponse.json(results);
}
