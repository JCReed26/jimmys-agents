"use client";

import { useEffect, useState, useCallback } from "react";
import { AGENTS } from "@/lib/agents";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Play, Check, Loader2, CalendarClock, Plus, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface Schedule {
  agent: string;
  name: string;
  cron_expr: string;
  enabled: number;
  task_prompt?: string;
}

const CRON_PRESETS = [
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Hourly",        value: "0 * * * *" },
  { label: "Daily 9am",    value: "0 9 * * *" },
  { label: "Daily 8pm",    value: "0 20 * * *" },
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

const emptyForm = (): Partial<Schedule> => ({
  agent: Object.keys(AGENTS)[0] ?? "",
  name: "",
  cron_expr: "0 9 * * *",
  enabled: 1,
  task_prompt: "",
});

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState("");
  const [deleting, setDeleting] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null); // null = create
  const [form, setForm] = useState<Partial<Schedule>>(emptyForm());

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/schedules", { cache: "no-store" });
      if (r.ok) setSchedules(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  }

  function openEdit(sched: Schedule) {
    setEditing(sched);
    setForm({ ...sched });
    setModalOpen(true);
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(agent: string, name: string) {
    const key = `${agent}-${name}`;
    setDeleting(key);
    try {
      await fetch(`/api/schedules/${agent}/${encodeURIComponent(name)}`, { method: "DELETE" });
      load();
    } finally {
      setDeleting("");
    }
  }

  async function triggerNow(agent: string, name: string) {
    const key = `${agent}-${name}`;
    setTriggering(key);
    try {
      await fetch(`/api/schedules/${agent}/${encodeURIComponent(name)}`, { method: "POST" });
    } finally {
      setTriggering("");
    }
  }

  const agentEntries = Object.entries(AGENTS);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-semibold flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            Schedules
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Scheduled tasks that automatically run agents on a cron
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          Add schedule
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <CalendarClock className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No schedules yet</p>
          <p className="text-[12px] text-muted-foreground/60">
            Create a schedule to run agents automatically on a cron
          </p>
          <Button size="sm" variant="outline" className="mt-1 h-8 text-xs gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Add schedule
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((sched) => {
            const cfg = AGENTS[sched.agent];
            if (!cfg) return null;
            const Icon = cfg.icon;
            const key = `${sched.agent}-${sched.name}`;
            const isEnabled = Boolean(sched.enabled);

            return (
              <Card key={key} className="bg-card border-border overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className="h-7 w-7 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cfg.accentColor}15`, border: `1px solid ${cfg.accentColor}25` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.accentColor }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{cfg.displayName}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                        {sched.name}
                      </span>
                      <code className="text-[10px] font-mono text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                        {sched.cron_expr}
                      </code>
                      <span className="text-[11px] text-muted-foreground/60">
                        {cronHuman(sched.cron_expr)}
                      </span>
                    </div>
                    {sched.task_prompt && (
                      <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">
                        {sched.task_prompt}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
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
                      variant="ghost" size="icon"
                      className="h-7 w-7"
                      title="Run now"
                      disabled={triggering === key}
                      onClick={() => triggerNow(sched.agent, sched.name)}
                    >
                      {triggering === key
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Play className="h-3.5 w-3.5" />
                      }
                    </Button>

                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7"
                      title="Edit"
                      onClick={() => openEdit(sched)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Delete"
                      disabled={deleting === key}
                      onClick={() => deleteSchedule(sched.agent, sched.name)}
                    >
                      {deleting === key
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              {editing ? "Edit schedule" : "New schedule"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Agent */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Agent</label>
              <Select
                value={form.agent}
                onValueChange={(v) => setForm((p) => ({ ...p, agent: v }))}
                disabled={!!editing}
              >
                <SelectTrigger className="h-8 text-sm bg-background border-border">
                  <SelectValue placeholder="Select agent" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {agentEntries.map(([key, cfg]) => (
                    <SelectItem key={key} value={key} className="text-sm">
                      {cfg.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">
                Schedule name <span className="text-muted-foreground/50">(unique per agent)</span>
              </label>
              <input
                type="text"
                value={form.name ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                disabled={!!editing}
                placeholder="e.g. daily-checkin"
                className="w-full h-8 bg-background border border-border rounded-md px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
            </div>

            {/* Cron */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Cron expression</label>
              <input
                type="text"
                value={form.cron_expr ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, cron_expr: e.target.value }))}
                placeholder="0 9 * * *"
                className="w-full h-8 bg-background border border-border rounded-md px-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {CRON_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setForm((prev) => ({ ...prev, cron_expr: p.value }))}
                    className="text-[9px] font-mono text-muted-foreground/70 border border-border px-1.5 py-0.5 rounded hover:text-foreground hover:border-border/80 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Task prompt */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-muted-foreground">Task prompt</label>
              <Textarea
                value={form.task_prompt ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, task_prompt: e.target.value }))}
                placeholder="What should the agent do on each run? (optional)"
                rows={3}
                className="text-sm bg-background border-border resize-none"
              />
            </div>

            {/* Enabled toggle */}
            <button
              onClick={() => setForm((p) => ({ ...p, enabled: p.enabled ? 0 : 1 }))}
              className={cn(
                "text-[11px] px-3 py-1 rounded-full border font-mono transition-colors",
                form.enabled
                  ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                  : "border-border text-muted-foreground"
              )}
            >
              {form.enabled ? "● enabled" : "○ disabled"}
            </button>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={saving || !form.agent || !form.name || !form.cron_expr}
              onClick={saveSchedule}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
              {editing ? "Save changes" : "Create schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
