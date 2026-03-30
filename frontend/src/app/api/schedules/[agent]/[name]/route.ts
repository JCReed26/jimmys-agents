import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ agent: string; name: string }> }
) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const { agent, name } = await params;
  try {
    const r = await fetch(`${API_BASE}/schedules/${agent}/${name}`, {
      method: 'DELETE',
      headers: bearerHeaders(token),
    });
    if (r.ok) return NextResponse.json({ ok: true });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ agent: string; name: string }> }
) {
  // POST to this route triggers a manual run for the schedule
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const { agent, name } = await params;
  try {
    const r = await fetch(`${API_BASE}/schedules/${agent}/trigger?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: bearerHeaders(token),
    });
    if (r.ok) return NextResponse.json({ ok: true });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}
