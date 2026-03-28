import { NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ hitl: 0, hotlUnread: 0 }, { status: 401 });
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 2000);
    const r = await fetch(`${API_BASE}/nav-counts`, {
      signal: controller.signal,
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    clearTimeout(tid);
    if (r.ok) return NextResponse.json(await r.json());
  } catch {
    // API server not running yet — return zeros
  }
  return NextResponse.json({ hitl: 0, hotlUnread: 0 });
}
