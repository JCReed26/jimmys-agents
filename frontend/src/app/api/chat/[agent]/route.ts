import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agent: string }> }
) {
  const { agent } = await params;
  const url = new URL(req.url);
  const threadId = url.searchParams.get('thread_id') ?? '';
  if (!threadId) return NextResponse.json({ messages: [] });

  try {
    const r = await fetch(
      `${API_BASE}/chat/${agent}/history?thread_id=${encodeURIComponent(threadId)}`,
      { cache: 'no-store' }
    );
    if (!r.ok) return NextResponse.json({ messages: [] });
    return NextResponse.json(await r.json());
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agent: string }> }
) {
  const { agent } = await params;
  try {
    const body = await req.json();
    // body has shape: { thread_id, messages }
    // Gateway expects exactly this format — no LangGraph fields needed here
    const upstream = await fetch(`${API_BASE}/agents/${agent}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Gateway returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
