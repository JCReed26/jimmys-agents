const API_BASE = process.env.AGENT_API_URL ?? "http://localhost:8080";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const agent = url.searchParams.get("agent") ?? undefined;
  try {
    const upstream = await fetch(
      `${API_BASE}/hotl/clear${agent ? `?agent=${encodeURIComponent(agent)}` : ""}`,
      { method: "POST" }
    );
    if (!upstream.ok) {
      return Response.json({ error: "Gateway error" }, { status: upstream.status });
    }
    return Response.json(await upstream.json());
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
