import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json([], { status: 401 });
  try {
    const r = await fetch(`${API_BASE}/schedules`, {
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json([]);
}

export async function POST(req: NextRequest) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const body = await req.json();
    const r = await fetch(`${API_BASE}/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
      body: JSON.stringify(body),
    });
    if (r.ok) return NextResponse.json({ ok: true });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}
