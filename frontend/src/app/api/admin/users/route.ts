import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(req: NextRequest) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ users: [] }, { status: 401 });
  const tenantId = new URL(req.url).searchParams.get('tenant_id') ?? '';
  try {
    const url = tenantId ? `${API_BASE}/admin/users?tenant_id=${encodeURIComponent(tenantId)}` : `${API_BASE}/admin/users`;
    const r = await fetch(url, { headers: bearerHeaders(token), cache: 'no-store' });
    if (r.ok) return NextResponse.json(await r.json());
    return NextResponse.json({ users: [] }, { status: r.status });
  } catch {
    return NextResponse.json({ users: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const r = await fetch(`${API_BASE}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const r = await fetch(`${API_BASE}/admin/users`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
