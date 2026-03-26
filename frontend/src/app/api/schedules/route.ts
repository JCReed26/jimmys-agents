import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  try {
    const r = await fetch(`${API_BASE}/schedules`, { cache: 'no-store' });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json([]);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const r = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) return NextResponse.json({ ok: true });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}
