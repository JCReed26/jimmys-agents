import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(req: NextRequest) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ results: [] }, { status: 401 });
  const q = new URL(req.url).searchParams.get('q') ?? '';
  if (!q || q.length < 2) return NextResponse.json({ results: [] });
  try {
    const r = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}`, {
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json({ results: [] });
}
