import { NextResponse } from 'next/server';
import { AGENTS, WORKFLOWS } from '@/lib/agents';

export async function GET() {
  const results: Record<string, any> = {};
  
  const allServices = { ...AGENTS, ...WORKFLOWS };

  for (const [key, config] of Object.entries(allServices)) {
    try {
      // Use a short timeout for health checks
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      // We assume config has a url property.
      // If it doesn't (some older workflow definition), skip or handle
      if (!(config as any).url) continue;

      const response = await fetch(`${(config as any).url}/ok`, { 
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

  return NextResponse.json(results);
}
