import { NextRequest, NextResponse } from 'next/server';
import { AGENTS, WORKFLOWS } from '@/lib/agents';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agent: string }> }
) {
  const { agent } = await params;
  const body = await req.json();

  // Check both AGENTS and WORKFLOWS
  // Casting to any because they might have slightly different shapes, but both have url
  const config = (AGENTS[agent] || WORKFLOWS[agent as keyof typeof WORKFLOWS]) as any;

  if (!config) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Forward to LangGraph agent
  try {
    const upstreamUrl = `${config.url}/runs/stream`;
    
    // We need to stream the response back to the client
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...body,
        assistant_id: "agent" // Required by LangGraph server
      }),
    });

    if (!upstreamResponse.body) {
      throw new Error('No response body from upstream');
    }

    return new NextResponse(upstreamResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Failed to communicate with agent' }, { status: 500 });
  }
}
