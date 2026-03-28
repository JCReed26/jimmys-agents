import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function POST(req: NextRequest) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const agent = body.agent ?? '';
    const qs = agent ? `?agent=${agent}` : '';
    const r = await fetch(`${API_BASE}/hotl/read-all${qs}`, {
      method: 'POST',
      headers: bearerHeaders(token),
    });
    if (r.ok) return NextResponse.json({ ok: true });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}
