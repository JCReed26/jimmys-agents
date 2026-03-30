import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ content: '' }, { status: 401 });
  const { name } = await params;
  try {
    const r = await fetch(`${API_BASE}/agents/${name}/agents-md`, {
      headers: bearerHeaders(token),
      cache: 'no-store',
    });
    if (r.ok) return NextResponse.json(await r.json());
    return NextResponse.json({ content: '' }, { status: r.status });
  } catch {
    return NextResponse.json({ content: '' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const token = await getServerAccessToken();
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name } = await params;
  try {
    const body = await req.json();
    const r = await fetch(`${API_BASE}/agents/${name}/agents-md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...bearerHeaders(token) },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await r.json(), { status: r.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
