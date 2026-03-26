import { NextResponse } from 'next/server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  try {
    const r = await fetch(`${API_BASE}/stats`, { cache: 'no-store' });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json({ by_agent: {}, total_runs: 0 });
}
