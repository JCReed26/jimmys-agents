"use client";

import { useEffect, useState, useCallback } from "react";
import { AGENTS } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Play, Check, Loader2, ChevronDown, ChevronUp, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Schedule {
  agent: string;
  cron_expr: string;
  enabled: number;
  task_prompt?: string;
  last_run?: string;
  next_run?: string;
}

const CRON_PRESETS = [
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Hourly",       value: "0 * * * *" },
  { label: "Daily 9am",   value: "0 9 * * *" },
  { label: "Daily 8pm",   value: "0 20 * * *" },
  { label: "Weekdays 9am", value: "0 9 * * 1-5" },
];

function cronHuman(expr: string): string {
  const map: Record<string, string> = {
    "*/15 * * * *": "Every 15 min",
    "*/30 * * * *": "Every 30 min",
    "0 * * * *":    "Hourly",
    "0 9 * * *":    "Daily at 9am",
    "0 20 * * *":   "Daily at 8pm",
    "0 9 * * 1-5":  "Weekdays at 9am",
  };
  return map[expr] ?? expr;
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Schedule>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [triggering, setTriggering] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/schedules", { cache: "no-store" });
      if (r.ok) setSchedules(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveSchedule(agent: string) {
    setSaving(true);
    try {
      await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent, ...editValues }),
      });
      setSaved(agent);
      setTimeout(() => setSaved(""), 2000);
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function triggerNow(agent: string) {
    setTriggering(agent);
    try {
      await fetch(`http://localhost:8080/schedules/${agent}/trigger`, { method: "POST" });
    } finally {
      setTriggering("");
    }
  }

  const agentKeys = Object.keys(AGENTS);
  const rows = agentKeys.map(
    (name) => schedules.find((s) => s.agent === name) ?? { agent: name, cron_expr: "*/30 * * * *", enabled: 1 } as Schedule
  );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-base font-semibold flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          Schedules
        </h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          Configure when each agent runs its background scheduled tasks
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((sched) => {
            const cfg = AGENTS[sched.agent];
            if (!cfg) return null;
            const Icon = cfg.icon;
            const isEditing = editing === sched.agent;
            const isEnabled = Boolean(sched.enabled);

            return (
              <Card
                key={sched.agent}
                className={cn(
                  "bg-card border-border overflow-hidden transition-colors",
                  isEditing && "border-border/80"
                )}
                style={isEditing ? { borderColor: `${cfg.accentColor}40` } : {}}
              >
                {/* Row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="h-7 w-7 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cfg.accentColor}15`, border: `1px solid ${cfg.accentColor}25` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.accentColor }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{cfg.displayName}</span>
                      <code className="text-[10px] font-mono text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                        {sched.cron_expr}
                      </code>
                      <span className="text-[11px] text-muted-foreground/60">
                        {cronHuman(sched.cron_expr)}
                      </span>
                    </div>
                    {sched.last_run && (
                      <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">
                        Last: {new Date(sched.last_run).toLocaleString()}
                        {sched.next_run && ` · Next: ${new Date(sched.next_run).toLocaleString()}`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border font-mono",
                        isEnabled
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : "border-border text-muted-foreground/60"
                      )}
                    >
                      {isEnabled ? "on" : "off"}
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] gap-1 px-2"
                      disabled={triggering === sched.agent}
                      onClick={() => triggerNow(sched.agent)}
                    >
                      {triggering === sched.agent
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <Play className="h-3 w-3" />
                      }
                      Run
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] gap-1 px-2"
                      onClick={() => {
                        if (isEditing) {
                          setEditing(null);
                        } else {
                          setEditing(sched.agent);
                          setEditValues({
                            cron_expr: sched.cron_expr,
                            enabled: sched.enabled,
                            task_prompt: sched.task_prompt ?? "",
                          });
                        }
                      }}
                    >
                      {isEditing ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      {isEditing ? "Close" : "Edit"}
                    </Button>
                  </div>
                </div>

                {/* Edit form */}
                {isEditing && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1.5">
                          Cron expression
                        </label>
                        <input
                          type="text"
                          value={editValues.cron_expr ?? ""}
                          onChange={(e) => setEditValues((p) => ({ ...p, cron_expr: e.target.value }))}
                          className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {CRON_PRESETS.map((p) => (
                            <button
                              key={p.value}
                              onClick={() => setEditValues((prev) => ({ ...prev, cron_expr: p.value }))}
                              className="text-[9px] font-mono text-muted-foreground/70 border border-border px-1.5 py-0.5 rounded hover:text-foreground hover:border-border/80 transition-colors"
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1.5">
                          Task prompt
                        </label>
                        <Textarea
                          value={editValues.task_prompt ?? ""}
                          onChange={(e) => setEditValues((p) => ({ ...p, task_prompt: e.target.value }))}
                          placeholder="What should the agent do on each scheduled run?"
                          rows={3}
                          className="text-sm bg-background border-border resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setEditValues((p) => ({ ...p, enabled: p.enabled ? 0 : 1 }))}
                        className={cn(
                          "text-[11px] px-3 py-1 rounded-full border font-mono transition-colors",
                          editValues.enabled
                            ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                            : "border-border text-muted-foreground"
                        )}
                      >
                        {editValues.enabled ? "● enabled" : "○ disabled"}
                      </button>

                      <Button
                        size="sm"
                        className="h-8 text-xs gap-1.5 ml-auto"
                        disabled={saving}
                        onClick={() => saveSchedule(sched.agent)}
                        style={saved === sched.agent ? {} : { backgroundColor: cfg.accentColor, color: "black" }}
                      >
                        {saved === sched.agent ? (
                          <><Check className="h-3 w-3" /> Saved</>
                        ) : saving ? (
                          <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>
                        ) : "Save schedule"}
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
