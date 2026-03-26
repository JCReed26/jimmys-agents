"use client";

import { useState } from "react";
import { AGENTS, WORKFLOWS } from "@/lib/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Settings, Server, AlertTriangle, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState("");

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

  const allSources = { ...AGENTS, ...WORKFLOWS };

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
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium flex items-center gap-1.5">
            <Server className="h-3 w-3" /> Services
          </p>
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium">Dashboard</span>
                <span className="text-[11px] text-muted-foreground ml-2">Next.js frontend</span>
              </div>
              <code className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                :3000
              </code>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-medium">API Server</span>
                <span className="text-[11px] text-muted-foreground ml-2">FastAPI backend</span>
              </div>
              <code className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                :8080
              </code>
            </div>
            {Object.entries(allSources).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.accentColor }} />
                    <span className="text-sm">{cfg.displayName}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] h-3.5 px-1 font-mono"
                      style={{ borderColor: `${cfg.accentColor}30`, color: cfg.accentColor }}
                    >
                      {cfg.type}
                    </Badge>
                  </div>
                  <code className="text-[11px] font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                    :{cfg.port}
                  </code>
                </div>
              );
            })}
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
