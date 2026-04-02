"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AGENTS } from "@/lib/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare, GitBranch, Activity, Clock,
  CheckCircle2, Circle, AlertCircle, Zap, RotateCw,
  ArrowRight, TrendingUp, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStatus {
  status: string;
  hitlCount: number;
  nextRun?: string;
  lastRun?: string;
  lastRunStatus?: string;
  lastError?: string;
  totalRuns: number;
  errorRuns?: number;
  tokenCount?: string;
  costToday?: number;
}

interface HotlEntry {
  id: number;
  agent: string;
  overview?: string;
  summary?: any;
  created_at: string;
  is_read: number;
  status?: string;
}

interface Stats {
  total_runs: number;
  total_tokens: number;
  total_cost: number;
  by_agent: Record<string, { runs: number; tokens: number; cost: number }>;
}

function useData() {
  const [agentData, setAgentData] = useState<Record<string, AgentStatus>>({});
  const [activity, setActivity] = useState<HotlEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [agentsRes, hotlRes, statsRes] = await Promise.allSettled([
          fetch("/api/agents", { cache: "no-store" }),
          fetch("/api/hotl?limit=10", { cache: "no-store" }),
          fetch("/api/stats", { cache: "no-store" }),
        ]);
        if (agentsRes.status === "fulfilled" && agentsRes.value.ok)
          setAgentData(await agentsRes.value.json());
        if (hotlRes.status === "fulfilled" && hotlRes.value.ok)
          setActivity((await hotlRes.value.json()).logs ?? []);
        if (statsRes.status === "fulfilled" && statsRes.value.ok)
          setStats(await statsRes.value.json());
      } finally {
        setLoading(false);
      }
    }
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, []);

  return { agentData, activity, stats, loading };
}

export default function DashboardPage() {
  const { agentData, activity, stats, loading } = useData();

  const agentEntries = Object.entries(AGENTS);
  const allStatuses = Object.values(agentData);
  const runningCount = allStatuses.filter((s) => s.status === "RUNNING").length;
  const hitlTotal = allStatuses.reduce((n, s) => n + (s.hitlCount ?? 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Agents"
          value={`${agentEntries.length}`}
          sub={runningCount > 0 ? `${runningCount} running` : "all idle"}
          icon={<Zap className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard
          label="Runs Today"
          value={`${stats?.total_runs ?? 0}`}
          sub="across all agents"
          icon={<Activity className="h-4 w-4" />}
          loading={loading}
        />
        <StatCard
          label="HITL Pending"
          value={String(hitlTotal)}
          sub={hitlTotal > 0 ? "needs review" : "all clear"}
          icon={<Inbox className="h-4 w-4" />}
          loading={loading}
          accent={hitlTotal > 0 ? "text-destructive" : undefined}
        />
      </div>

      {/* Agents */}
      <div>
        <SectionLabel>Agents</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {agentEntries.map(([key, cfg]) => (
            <AgentCard key={key} agentKey={key} cfg={cfg} status={agentData[key]} loading={loading} />
          ))}
        </div>
      </div>

      {/* Activity feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <SectionLabel className="mb-0">Recent Activity</SectionLabel>
          <Link href="/logs">
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground">
              All logs <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : activity.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No recent activity. Runs will appear here.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {activity.slice(0, 8).map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-medium text-muted-foreground/70 uppercase tracking-widest mb-3", className)}>
      {children}
    </p>
  );
}

function StatCard({
  label, value, sub, icon, loading, accent,
}: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; loading: boolean; accent?: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        {loading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
              <p className={cn("text-2xl font-semibold font-mono tabular-nums", accent)}>{value}</p>
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</p>
            </div>
            <div className="text-muted-foreground/40 mt-0.5">{icon}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AgentCard({
  agentKey, cfg, status, loading,
}: {
  agentKey: string;
  cfg: typeof AGENTS[string];
  status?: AgentStatus;
  loading: boolean;
}) {
  const Icon = cfg.icon;
  const isRunning = status?.status === "RUNNING";
  const hasHitl = (status?.hitlCount ?? 0) > 0;

  return (
    <Link href={`/agent/${agentKey}`} className="block group">
      <Card className="bg-card border-border transition-colors hover:border-border/80 hover:bg-card/80 h-full">
        <CardContent className="p-4">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cfg.accentColor}18`, border: `1px solid ${cfg.accentColor}30` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: cfg.accentColor }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium leading-tight">{cfg.displayName}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{cfg.description}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot running={isRunning} color={cfg.accentColor} />
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {isRunning ? "running" : "idle"}
                  </span>
                  {hasHitl && (
                    <Badge variant="destructive" className="h-4 text-[10px] px-1.5 font-mono">
                      {status!.hitlCount} HITL
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="text-[11px]">Chat</span>
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {status?.lastRun && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono">
                    <Clock className="h-2.5 w-2.5" />
                    <span>last run {relTime(status.lastRun)}</span>
                    {status.lastRunStatus === "error" && (
                       <AlertCircle className="h-2.5 w-2.5 text-destructive ml-1" />
                    )}
                  </div>
                  {status.lastRunStatus === "error" && status.lastError && (
                    <p className="text-[10px] text-destructive truncate max-w-full">
                      Error: {status.lastError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}


function ActivityRow({ entry }: { entry: HotlEntry }) {
  const allAgents = { ...AGENTS };
  const cfg = allAgents[entry.agent];
  const accentColor = cfg?.accentColor ?? "#888";
  let summaryObj = entry.summary;
  if (typeof summaryObj === "string") {
    try { summaryObj = JSON.parse(summaryObj); } catch {}
  }
  const overview = entry.overview || summaryObj?.overview || "";

  return (
    <div className={cn("flex items-start gap-3 px-4 py-3 text-sm", !entry.is_read && "bg-muted/20")}>
      <div
        className="h-1.5 w-1.5 rounded-full mt-2 shrink-0"
        style={{ backgroundColor: entry.is_read ? "transparent" : accentColor }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-medium" style={{ color: accentColor }}>
            {entry.agent}
          </span>
          <span className="text-[10px] text-muted-foreground/50 font-mono ml-auto shrink-0">
            {relTime(entry.created_at)}
          </span>
        </div>
        <p className="text-[12px] text-muted-foreground truncate">{overview}</p>
      </div>
    </div>
  );
}

function StatusDot({ running, color }: { running: boolean; color: string }) {
  return (
    <div className="relative flex h-2 w-2">
      {running && (
        <span
          className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex rounded-full h-2 w-2"
        style={{ backgroundColor: running ? color : "var(--color-muted-foreground)" }}
      />
    </div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
