import { NextResponse } from 'next/server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${API_BASE}/agents`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(tid);
    if (r.ok) return NextResponse.json(await r.json());
  } catch {
    // API server not running — return all DOWN
  }
  return NextResponse.json({
    "gmail-agent":    { status: 'DOWN' },
    "calendar-agent": { status: 'DOWN' },
    "budget-agent":   { status: 'DOWN' },
    "job-app-chain":  { status: 'DOWN' },
  });
}
