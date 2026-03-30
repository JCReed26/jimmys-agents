"use client";

import { useState, useEffect } from "react";
import { AGENTS } from "@/lib/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Server, AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceHealth {
  name: string;
  port: number;
  status: "ok" | "error" | "timeout" | "degraded";
  latency_ms: number;
}

export default function SettingsPage() {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState("");
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [healthLoading, setHealthLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function fetchHealth() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        setHealth(data.services);
        setLastChecked(new Date());
      }
    } catch (e) {
      console.error("Failed to fetch health", e);
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
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

      {/* System info */}
      <Card className="bg-card border-border">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium flex items-center gap-1.5">
              <Server className="h-3 w-3" /> Services
            </p>
            <div className="flex items-center gap-2">
              {lastChecked && (
                <span className="text-[10px] text-muted-foreground">
                  Last checked: {lastChecked.toLocaleTimeString()}
                </span>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchHealth} disabled={healthLoading}>
                <RefreshCw className={cn("h-3 w-3 text-muted-foreground", healthLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
          
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium">Dashboard</span>
                <span className="text-[11px] text-muted-foreground ml-2">Next.js frontend</span>
              </div>
              <div className="flex items-center gap-3">
                <code className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                  :3000
                </code>
              </div>
            </div>
            
            {healthLoading && health.length === 0 ? (
              <div className="py-4 flex justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              health.map((svc) => (
                <div key={svc.name} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      svc.status === "ok" ? "bg-emerald-500" :
                      svc.status === "degraded" || svc.status === "timeout" ? "bg-amber-500" :
                      "bg-destructive"
                    )} />
                    <span className="text-sm font-medium">{svc.name}</span>
                    <span className="text-[11px] text-muted-foreground ml-2 capitalize">{svc.status}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {svc.latency_ms}ms
                    </span>
                    <code className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded w-12 text-center">
                      :{svc.port}
                    </code>
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
