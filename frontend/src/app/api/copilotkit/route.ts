import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";
import { AGENTS } from "@/lib/agents";

// Each agent in agents.ts must have a matching entry in langgraph.json with
// graphId matching its key. All agents in this repo use graphId="agent" per the template.
export const POST = async (req: NextRequest) => {
  const agents = Object.fromEntries(
    Object.entries(AGENTS).map(([key, cfg]) => [
      key,
      new LangGraphAgent({
        deploymentUrl: cfg.url,
        graphId: cfg.graphId,
        agentName: key,
      }),
    ])
  );

  const runtime = new CopilotRuntime({ agents });

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
