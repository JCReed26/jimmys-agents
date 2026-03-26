"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AGENTS, WORKFLOWS } from "@/lib/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MessageSquare, GitBranch, Activity, Clock, DollarSign,
  CheckCircle2, Circle, AlertCircle, Zap, RotateCw,
  ArrowRight, TrendingUp, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentStatus {
  status: string;
  hitlCount: number;
  nextRun?: string;
  lastRun?: string;
  totalRuns: number;
  tokenCount?: string;
  costToday?: number;
}

interface HotlEntry {
  id: number;
  agent: string;
  overview: string;
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
  const workflowEntries = Object.entries(WORKFLOWS);
  const allStatuses = Object.values(agentData);
  const runningCount = allStatuses.filter((s) => s.status === "RUNNING").length;
  const hitlTotal = allStatuses.reduce((n, s) => n + (s.hitlCount ?? 0), 0);
  const costToday = stats ? Object.values(stats.by_agent).reduce((n, a) => n + (a.cost ?? 0), 0) : 0;

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
          label="Workflows"
          value={`${workflowEntries.length}`}
          sub={`${agentData["job-app-chain"]?.totalRuns ?? 0} total runs`}
          icon={<GitBranch className="h-4 w-4" />}
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
        <StatCard
          label="Cost Today"
          value={`$${costToday.toFixed(2)}`}
          sub={`${stats?.total_runs ?? "—"} runs total`}
          icon={<DollarSign className="h-4 w-4" />}
          loading={loading}
        />
      </div>

      {/* Agents + Workflows */}
      <div>
        <SectionLabel>Agents</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {agentEntries.map(([key, cfg]) => (
            <AgentCard key={key} agentKey={key} cfg={cfg} status={agentData[key]} loading={loading} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Workflows</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {workflowEntries.map(([key, cfg]) => (
            <WorkflowCard key={key} agentKey={key} cfg={cfg} status={agentData[key]} loading={loading} />
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
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono">
                  <Clock className="h-2.5 w-2.5" />
                  <span>last run {relTime(status.lastRun)}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function WorkflowCard({
  agentKey, cfg, status, loading,
}: {
  agentKey: string;
  cfg: typeof WORKFLOWS[string];
  status?: AgentStatus;
  loading: boolean;
}) {
  const Icon = cfg.icon;
  const isRunning = status?.status === "RUNNING";

  return (
    <Link href={`/workflow/${agentKey}`} className="block group">
      <Card className="bg-card border-border transition-colors hover:border-border/80 h-full">
        <CardContent className="p-4">
          {loading ? (
            <Skeleton className="h-24 w-full" />
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
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono shrink-0"
                  style={{ borderColor: `${cfg.accentColor}40`, color: cfg.accentColor }}
                >
                  workflow
                </Badge>
              </div>

              {/* Step preview */}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono overflow-hidden">
                {["reader", "scraper", "classifier", "optimizer", "writer"].map((s, i, arr) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className="px-1.5 py-0.5 rounded bg-muted/60">{s}</span>
                    {i < arr.length - 1 && <span className="opacity-40">→</span>}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot running={isRunning} color={cfg.accentColor} />
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {isRunning ? "running" : "idle"}
                  </span>
                  {status?.totalRuns !== undefined && (
                    <span className="text-[10px] text-muted-foreground/50 font-mono">
                      {status.totalRuns} runs
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                  <span className="text-[11px]">View graph</span>
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function ActivityRow({ entry }: { entry: HotlEntry }) {
  const allAgents = { ...AGENTS, ...WORKFLOWS };
  const cfg = allAgents[entry.agent];
  const accentColor = cfg?.accentColor ?? "#888";

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
        <p className="text-[12px] text-muted-foreground truncate">{entry.overview}</p>
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
