import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') ?? 'contracts';
  try {
    if (resource === 'messages') {
      const r = await fetch(`${API_BASE}/council/messages`, { cache: 'no-store' });
      if (r.ok) return NextResponse.json(await r.json());
    } else {
      const r = await fetch(`${API_BASE}/council/contracts`, { cache: 'no-store' });
      if (r.ok) return NextResponse.json(await r.json());
    }
  } catch { /* ignore */ }
  return NextResponse.json([]);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const resource = searchParams.get('resource') ?? 'contracts';
  try {
    const body = await req.json();
    if (resource === 'messages') {
      const r = await fetch(`${API_BASE}/council/messages?sender=${encodeURIComponent(body.sender)}&content=${encodeURIComponent(body.content)}`, { method: 'POST' });
      if (r.ok) return NextResponse.json(await r.json());
    } else {
      const r = await fetch(`${API_BASE}/council/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) return NextResponse.json(await r.json());
    }
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') ?? '';
  try {
    const body = await req.json();
    const r = await fetch(`${API_BASE}/council/contracts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok) return NextResponse.json({ ok: true });
  } catch { /* ignore */ }
  return NextResponse.json({ ok: false }, { status: 500 });
}
