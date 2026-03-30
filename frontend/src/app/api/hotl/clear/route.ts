import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function POST(request: Request) {
  const token = await getServerAccessToken();
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const url = new URL(request.url);
  const agent = url.searchParams.get('agent') ?? undefined;
  try {
    const upstream = await fetch(
      `${API_BASE}/hotl/clear${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`,
      { method: 'POST', headers: bearerHeaders(token) }
    );
    if (!upstream.ok) {
      return Response.json({ error: 'Gateway error' }, { status: upstream.status });
    }
    return Response.json(await upstream.json());
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
