"use client";

import { useState, useEffect } from "react";
import { AGENTS } from "@/lib/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Server, AlertTriangle, Check, Loader2, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceHealth {
  name: string;
  url: string;
  port: number;
  status: "ok" | "degraded" | "error";
  latency_ms: number;
}

export default function SettingsPage() {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState("");
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        setHealth(data.services);
        setLastChecked(new Date());
      } catch (e) {
        console.error("Failed to fetch health", e);
      }
    }
    checkHealth();
    const iv = setInterval(checkHealth, 30000);
    return () => clearInterval(iv);
  }, []);

  async function clearLogs() {
    setClearing(true);
    try {
      await fetch("/api/hotl/clear", { method: "POST" });
      setCleared("logs");
      setTimeout(() => setCleared(""), 2000);
    } finally {
      setClearing(false);
    }
  }

  const allSources = { ...AGENTS };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          Settings
        </h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">System configuration and diagnostic info</p>
      </div>

      {/* System info / Health panel */}
      <Card className="bg-card border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> System Health
            </p>
            {lastChecked && (
              <span className="text-[10px] text-muted-foreground/50 font-mono">
                Last checked: {lastChecked.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="divide-y divide-border">
            {health.length === 0 ? (
              <div className="py-8 flex justify-center items-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              health.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      svc.status === "ok" ? "bg-emerald-500" :
                      svc.status === "degraded" ? "bg-amber-500" :
                      "bg-destructive"
                    )} />
                    <div>
                      <p className="text-sm font-medium">{svc.name}</p>
                      <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
                        :{svc.port}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider",
                      svc.status === "ok" ? "text-emerald-500/80 bg-emerald-500/10" :
                      svc.status === "degraded" ? "text-amber-500/80 bg-amber-500/10" :
                      "text-destructive/80 bg-destructive/10"
                    )}>
                      {svc.status}
                    </span>
                    {svc.latency_ms !== undefined && (
                      <span className="text-[9px] text-muted-foreground/40 font-mono mt-1">
                        {svc.latency_ms}ms
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Environment */}
      <Card className="bg-card border-border">
        <CardContent className="p-5 space-y-3">
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium">Environment</p>
          <div className="space-y-2">
            {[
              { label: "AGENT_API_URL", value: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080" },
              { label: "NODE_ENV", value: process.env.NODE_ENV ?? "development" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-3 font-mono text-[11px]">
                <span className="text-muted-foreground/60 w-40 shrink-0">{label}</span>
                <span className="text-foreground/80">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="bg-card border-destructive/20">
        <CardContent className="p-5 space-y-4">
          <p className="text-[11px] text-destructive/70 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> Danger zone
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Clear run logs</p>
                <p className="text-[12px] text-muted-foreground">Remove all HOTL log entries from the database</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 gap-1.5"
                disabled={clearing}
                onClick={clearLogs}
              >
                {cleared === "logs" ? (
                  <><Check className="h-3 w-3" /> Cleared</>
                ) : clearing ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Clearing…</>
                ) : "Clear logs"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
