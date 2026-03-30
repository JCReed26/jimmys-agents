import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agent: string }> }
) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json([], { status: 401 });
  const { agent } = await params;
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get('limit') ?? '20';
  const qs = new URLSearchParams({ agent, limit });
  try {
    const r = await fetch(`${API_BASE}/runs?${qs}`, {
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json([]);
}
