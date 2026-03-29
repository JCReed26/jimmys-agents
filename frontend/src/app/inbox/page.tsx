"use client";

import { useEffect, useState, useCallback } from "react";
import { AGENTS, ALL_SOURCES } from "@/lib/agents";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCheck, Inbox, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface HitlItem {
  id: number;
  agent: string;
  payload: string;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  step?: string;
}

type TabId = "all" | "agents";

export default function InboxPage() {
  const [items, setItems] = useState<HitlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("all");
  const [resolving, setResolving] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/hitl", { cache: "no-store" });
      if (r.ok) {
        const data = await r.json();
        setItems(data.items ?? data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function resolve(id: number, decision: "approved" | "rejected") {
    setResolving((s) => new Set(s).add(id));
    try {
      await fetch(`/api/hitl/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      setItems((prev) =>
        prev.map((x) => x.id === id ? { ...x, status: decision } : x)
      );
    } finally {
      setResolving((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  }

  async function bulkApprove() {
    const pending = filtered.filter((x) => x.status === "pending");
    await Promise.all(pending.map((x) => resolve(x.id, "approved")));
  }

  const agentKeys = new Set(Object.keys(AGENTS));

  const filtered = items.filter((item) => {
    if (tab === "agents") return agentKeys.has(item.agent);
    return true;
  });

  const pending = filtered.filter((x) => x.status === "pending");
  const resolved = filtered.filter((x) => x.status !== "pending");

  const pendingAll = items.filter((x) => x.status === "pending").length;
  const pendingAgents = items.filter((x) => x.status === "pending" && agentKeys.has(x.agent)).length;

  const tabs: { id: TabId; label: string; count: number }[] = [
    { id: "all",       label: "All",       count: pendingAll },
    { id: "agents",    label: "Agents",    count: pendingAgents },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Inbox className="h-4 w-4 text-muted-foreground" />
            HITL Inbox
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Human-in-the-loop items requiring your decision
          </p>
        </div>
        {pending.length > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={bulkApprove}>
            <CheckCheck className="h-3.5 w-3.5" />
            Approve all ({pending.length})
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(({ id, label, count }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors border-b-2 -mb-px",
              tab === id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
            {count > 0 && (
              <Badge variant="destructive" className="h-4 text-[10px] px-1.5 font-mono">
                {count}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Pending */}
          {pending.length > 0 && (
            <section className="space-y-2">
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium">
                Pending · {pending.length}
              </p>
              {pending.map((item) => (
                <HitlCard
                  key={item.id}
                  item={item}
                  onResolve={resolve}
                  resolving={resolving.has(item.id)}
                />
              ))}
            </section>
          )}

          {/* No pending */}
          {pending.length === 0 && !loading && (
            <Card className="bg-card border-border">
              <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCheck className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">All clear</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">No pending HITL items</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Resolved */}
          {resolved.length > 0 && (
            <section className="space-y-2">
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium">
                Resolved · {resolved.length}
              </p>
              {resolved.slice(0, 10).map((item) => (
                <HitlCard key={item.id} item={item} onResolve={resolve} resolving={false} readonly />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function HitlCard({
  item, onResolve, resolving, readonly,
}: {
  item: HitlItem;
  onResolve: (id: number, d: "approved" | "rejected") => void;
  resolving: boolean;
  readonly?: boolean;
}) {
  const cfg = ALL_SOURCES[item.agent];
  const accentColor = cfg?.accentColor ?? "#888";
  const isPending = item.status === "pending";

  let payload: unknown = item.payload;
  try { payload = JSON.parse(item.payload); } catch {}

  return (
    <Card
      className={cn(
        "bg-card border-border overflow-hidden",
        isPending && "border-l-2"
      )}
      style={isPending ? { borderLeftColor: accentColor } : {}}
    >
      <CardContent className="p-4 space-y-3">
        {/* Meta */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {isPending && <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
            <span className="text-[12px] font-medium" style={{ color: accentColor }}>
              {cfg?.displayName ?? item.agent}
            </span>
            {item.step && (
              <Badge
                variant="outline"
                className="text-[9px] h-4 px-1.5 font-mono"
                style={{ borderColor: `${accentColor}30`, color: accentColor }}
              >
                {item.step}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isPending && (
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] h-4 px-1.5 font-mono",
                  item.status === "approved"
                    ? "border-emerald-500/40 text-emerald-400"
                    : "border-destructive/40 text-destructive"
                )}
              >
                {item.status}
              </Badge>
            )}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono">
              <Clock className="h-2.5 w-2.5" />
              {relTime(item.created_at)}
            </div>
          </div>
        </div>

        {/* Payload */}
        <pre className="text-[11px] font-mono text-foreground/70 whitespace-pre-wrap break-all bg-muted/30 rounded-md px-3 py-2.5 max-h-40 overflow-y-auto">
          {typeof payload === "object" ? JSON.stringify(payload, null, 2) : String(payload)}
        </pre>

        {/* Actions */}
        {isPending && !readonly && (
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
              disabled={resolving}
              onClick={() => onResolve(item.id, "approved")}
            >
              {resolving ? "…" : "Approve"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
              disabled={resolving}
              onClick={() => onResolve(item.id, "rejected")}
            >
              {resolving ? "…" : "Reject"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
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
