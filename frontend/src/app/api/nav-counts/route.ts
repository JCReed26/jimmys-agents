import { NextResponse } from 'next/server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 2000);
    const r = await fetch(`${API_BASE}/nav-counts`, { signal: controller.signal, cache: 'no-store' });
    clearTimeout(tid);
    if (r.ok) return NextResponse.json(await r.json());
  } catch {
    // API server not running yet — return zeros
  }
  return NextResponse.json({ hitl: 0, hotlUnread: 0 });
}
