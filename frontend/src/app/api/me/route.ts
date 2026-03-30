import { NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 });
  try {
    const r = await fetch(`${API_BASE}/me`, {
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    if (r.ok) return NextResponse.json(await r.json());
  } catch { /* ignore */ }
  return NextResponse.json({ tenant_id: null, user_id: null, tenant_name: null });
}
