import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const r = await fetch(`${API_BASE}/hotl/${id}/read`, { method: 'POST' });
    if (r.ok) return NextResponse.json({ ok: true });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}
