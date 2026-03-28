import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ agent: string }> }
) {
  const token = await getServerAccessToken();
  const { agent } = await params;
  try {
    const upstream = await fetch(`${API_BASE}/sse/${agent}/live`, {
      signal: req.signal,
      headers: { Accept: 'text/event-stream', ...bearerHeaders(token) },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(null, { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        Connection: 'keep-alive',
      },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}
