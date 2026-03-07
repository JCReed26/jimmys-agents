import { NextResponse } from 'next/server';
import { AGENTS } from '@/lib/agents';

export async function GET() {
  const results: Record<string, any> = {};

  for (const [key, agent] of Object.entries(AGENTS)) {
    try {
      // Use a short timeout for health checks
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const response = await fetch(`${agent.url}/ok`, { 
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        results[key] = { status: 'RUNNING' };
      } else {
        results[key] = { status: 'DOWN' };
      }
    } catch (error) {
      results[key] = { status: 'DOWN' };
    }
  }

  // Also include job-app-chain logic if needed, but it's a file-based check in Python.
  // In Next.js (Node), we can check file existence if running locally.
  // For now, let's just return the HTTP agents.

  return NextResponse.json(results);
}
