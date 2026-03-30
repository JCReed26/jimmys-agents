"use client";

import { useEffect, useState } from "react";
import { ALL_SOURCES } from "@/lib/agents";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, DollarSign, Cpu, Activity, Clock, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStat {
  runs: number;
  tokens: number;
  cost: number;
  avg_duration_s?: number;
  success_rate?: number;
}

interface Stats {
  total_runs: number;
  total_tokens: number;
  total_cost: number;
  by_agent: Record<string, AgentStat>;
  daily?: { date: string; tokens: number; cost: number; runs: number }[];
}

export default function ObservePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats", { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setStats(d); })
      .finally(() => setLoading(false));

    const iv = setInterval(() => {
      fetch("/api/stats", { cache: "no-store" })
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setStats(d); });
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const totalCost = stats?.total_cost ?? 0;
  const totalTokens = stats?.total_tokens ?? 0;
  const totalRuns = stats?.total_runs ?? 0;
  const monthly = totalCost * 30; // rough extrapolation

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-base font-semibold">Observability</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Cost, token usage, and run performance across all agents
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Total cost",
            value: loading ? null : `$${totalCost.toFixed(4)}`,
            sub: loading ? null : `~$${monthly.toFixed(2)}/mo at current rate`,
            icon: <DollarSign className="h-4 w-4" />,
          },
          {
            label: "Total tokens",
            value: loading ? null : fmtNum(totalTokens),
            sub: loading ? null : `${totalRuns} runs`,
            icon: <Cpu className="h-4 w-4" />,
          },
          {
            label: "Avg cost/run",
            value: loading ? null : totalRuns > 0 ? `$${(totalCost / totalRuns).toFixed(5)}` : "$0",
            sub: loading ? null : "across all sources",
            icon: <TrendingUp className="h-4 w-4" />,
          },
          {
            label: "Avg tokens/run",
            value: loading ? null : totalRuns > 0 ? fmtNum(Math.round(totalTokens / totalRuns)) : "0",
            sub: loading ? null : "per run average",
            icon: <Activity className="h-4 w-4" />,
          },
        ].map(({ label, value, sub, icon }) => (
          <Card key={label} className="bg-card border-border">
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-14 w-full" />
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                    <p className="text-xl font-semibold font-mono tabular-nums">{value}</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>
                  </div>
                  <div className="text-muted-foreground/40">{icon}</div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Per-agent breakdown */}
      <div>
        <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium mb-3">
          Per agent
        </p>
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="divide-y divide-border">
                {/* Header row */}
                <div className="grid grid-cols-5 px-4 py-2 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
                  <span className="col-span-2">Source</span>
                  <span className="text-right">Runs</span>
                  <span className="text-right">Tokens</span>
                  <span className="text-right">Cost</span>
                </div>
                {Object.entries(ALL_SOURCES).map(([key, cfg]) => {
                  const s = stats?.by_agent?.[key];
                  const Icon = cfg.icon;
                  return (
                    <div key={key} className="grid grid-cols-5 items-center px-4 py-3 hover:bg-muted/20 transition-colors">
                      <div className="col-span-2 flex items-center gap-2.5">
                        <div
                          className="h-6 w-6 rounded flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cfg.accentColor}15`, border: `1px solid ${cfg.accentColor}25` }}
                        >
                          <Icon className="h-3 w-3" style={{ color: cfg.accentColor }} />
                        </div>
                        <div>
                          <span className="text-sm font-medium">{cfg.displayName}</span>
                          <Badge
                            variant="outline"
                            className="ml-2 text-[9px] h-3.5 px-1 font-mono"
                            style={{ borderColor: `${cfg.accentColor}30`, color: cfg.accentColor }}
                          >
                            {cfg.type}
                          </Badge>
                        </div>
                      </div>
                      <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {s?.runs ?? 0}
                      </span>
                      <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        {fmtNum(s?.tokens ?? 0)}
                      </span>
                      <span className="text-right font-mono text-sm tabular-nums">
                        ${(s?.cost ?? 0).toFixed(4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spark bars — visual token distribution */}
      {stats && Object.keys(stats.by_agent).length > 0 && (
        <div>
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium mb-3">
            Token distribution
          </p>
          <Card className="bg-card border-border">
            <CardContent className="p-4 space-y-3">
              {Object.entries(ALL_SOURCES).map(([key, cfg]) => {
                const s = stats.by_agent[key];
                const pct = totalTokens > 0 ? ((s?.tokens ?? 0) / totalTokens) * 100 : 0;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{cfg.displayName}</span>
                      <span className="font-mono text-muted-foreground/60">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cfg.accentColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
