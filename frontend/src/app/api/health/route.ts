import { NextResponse } from 'next/server';
import { AGENTS } from '@/lib/agents';

const API_BASE = process.env.AGENT_API_URL ?? 'http://localhost:8080';

export async function GET() {
  const services = [];

  // Check API Server
  const startApi = Date.now();
  try {
    const res = await fetch(`${API_BASE}/ok`, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    services.push({
      name: "API Server",
      port: 8080,
      status: res.ok ? (data.db === "error" ? "degraded" : "ok") : "error",
      latency_ms: Date.now() - startApi
    });
  } catch (e) {
    services.push({ name: "API Server", port: 8080, status: "timeout", latency_ms: Date.now() - startApi });
  }

  // Check Agents
  const agentPromises = Object.values(AGENTS).map(async (agent) => {
    const startAgent = Date.now();
    try {
      // Agents running deepagents framework expose /assistants or /ok, but here we can just check /
      // Let's use /assistants since that's what the backend uses for circuit breaking
      const res = await fetch(`http://localhost:${agent.port}/assistants`, { signal: AbortSignal.timeout(2000), cache: 'no-store' });
      return {
        name: agent.displayName,
        port: agent.port,
        status: res.ok ? "ok" : "error",
        latency_ms: Date.now() - startAgent
      };
    } catch (e) {
      return {
        name: agent.displayName,
        port: agent.port,
        status: "timeout",
        latency_ms: Date.now() - startAgent
      };
    }
  });

  const agentResults = await Promise.all(agentPromises);
  services.push(...agentResults);

  return NextResponse.json({ services });
}
