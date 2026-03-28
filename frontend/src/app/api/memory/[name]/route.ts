import { NextRequest, NextResponse } from 'next/server';
import { getServerAccessToken, bearerHeaders } from '@/lib/auth-server';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const token = await getServerAccessToken();
  const { name } = await params;
  try {
    const headers = bearerHeaders(token);
    const [memR, rulesR] = await Promise.all([
      fetch(`${API_BASE}/agents/${name}/memory`, { headers, cache: 'no-store' }),
      fetch(`${API_BASE}/agents/${name}/rules`,  { headers, cache: 'no-store' }),
    ]);
    const memory = memR.ok   ? (await memR.json()).content   : '_(API offline)_';
    const rules  = rulesR.ok ? (await rulesR.json()).content : '_(API offline)_';
    return NextResponse.json({ memory, rules });
  } catch {
    return NextResponse.json({ memory: '_(API offline)_', rules: '_(API offline)_' });
  }
}
