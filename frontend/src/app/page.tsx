"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AGENTS } from "@/lib/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MessageSquare, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStatus {
  status: "RUNNING" | "DOWN";
  enabled: boolean;
}

export default function DashboardPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function poll() {
      try {
        const r = await fetch("/api/agents", { cache: "no-store" });
        if (r.ok) setStatuses(await r.json());
      } finally {
        setLoading(false);
      }
    }
    poll();
    const iv = setInterval(poll, 30000);
    return () => clearInterval(iv);
  }, []);

  const agents = Object.entries(AGENTS);

  return (
    <div className="max-w-4xl mx-auto py-10 px-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold mb-1">Agents</h1>
        <p className="text-sm text-muted-foreground">
          {agents.length} agent{agents.length !== 1 ? "s" : ""} configured · click to chat
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {agents.map(([key, cfg]) => {
          const Icon = cfg.icon;
          const s = statuses[key];
          const isUp = s?.status === "RUNNING";

          return (
            <Card
              key={key}
              className="bg-card border-border cursor-pointer group hover:border-border/60 transition-colors"
              onClick={() => router.push(`/agent/${key}`)}
            >
              <CardContent className="p-5">
                {loading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <div
                        className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${cfg.accentColor}18`,
                          border: `1px solid ${cfg.accentColor}30`,
                        }}
                      >
                        <Icon className="h-4 w-4" style={{ color: cfg.accentColor }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{cfg.displayName}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-2">
                          {cfg.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StatusDot up={isUp} color={cfg.accentColor} />
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {isUp ? "running" : "offline"} · :{cfg.port}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors text-[11px]">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>Chat</span>
                        <ArrowRight className="h-3 w-3" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot({ up, color }: { up: boolean; color: string }) {
  return (
    <div className="relative flex h-2 w-2">
      {up && (
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full h-2 w-2"
        style={{ backgroundColor: up ? color : "var(--color-muted-foreground)" }}
      />
    </div>
  );
}
