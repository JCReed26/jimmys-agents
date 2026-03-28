import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(req: NextRequest) {
  const token = await getServerAccessToken();
  const { searchParams } = new URL(req.url);
  const agent      = searchParams.get('agent') ?? '';
  const unreadOnly = searchParams.get('unread_only') === 'true';
  const qs = new URLSearchParams();
  if (agent) qs.set('agent', agent);
  if (unreadOnly) qs.set('unread_only', 'true');
  try {
    const r = await fetch(`${API_BASE}/hotl?${qs}`, {
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json([]);
}

export async function POST(req: NextRequest) {
  const token = await getServerAccessToken();
  try {
    const body = await req.json();
    const r = await fetch(`${API_BASE}/hotl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
      body: JSON.stringify(body),
    });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}
