"use client";

import React, { use, useEffect, useRef, useState, useCallback } from "react";
import { AGENTS } from "@/lib/agents";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Send, Loader2, ChevronRight, ChevronLeft, Cpu,
  CalendarClock, BookOpen, Inbox, Play, Check,
  Bot, User, RotateCw, Clock, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const CRON_PRESETS = [
  { label: "15m", value: "*/15 * * * *" },
  { label: "30m", value: "*/30 * * * *" },
  { label: "1h",  value: "0 * * * *" },
  { label: "9am", value: "0 9 * * *" },
  { label: "8pm", value: "0 20 * * *" },
];

interface Schedule {
  agent: string;
  cron_expr: string;
  enabled: number;
  task_prompt?: string;
  last_run?: string;
  next_run?: string;
}

interface HitlItem {
  id: number;
  agent: string;
  payload: string;
  created_at: string;
  status: string;
}

export default function AgentPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const cfg = AGENTS[name];

  const { messages, sendMessage, isLoading, error } = useAgentChat(name);
  const [panelOpen, setPanelOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"schedule" | "memory" | "hitl">("schedule");
  const [inputVal, setInputVal] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Panel data
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [schedEdit, setSchedEdit] = useState<Partial<Schedule>>({});
  const [schedSaved, setSchedSaved] = useState(false);
  const [schedSaving, setSchedSaving] = useState(false);
  const [memory, setMemory] = useState<{ memory: string; rules: string } | null>(null);
  const [hitlItems, setHitlItems] = useState<HitlItem[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load schedule
  useEffect(() => {
    fetch("/api/schedules", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: Schedule[]) => {
        const s = data.find((x) => x.agent === name);
        if (s) { setSchedule(s); setSchedEdit({ cron_expr: s.cron_expr, enabled: s.enabled, task_prompt: s.task_prompt ?? "" }); }
      })
      .catch(() => {});
  }, [name]);

  const loadPanel = useCallback(async (panel: typeof activePanel) => {
    setPanelLoading(true);
    try {
      if (panel === "memory") {
        const r = await fetch(`/api/memory/${name}`, { cache: "no-store" });
        if (r.ok) setMemory(await r.json());
      } else if (panel === "hitl") {
        const r = await fetch(`/api/hitl?agent=${name}`, { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setHitlItems(data.items ?? data ?? []);
        }
      }
    } finally {
      setPanelLoading(false);
    }
  }, [name]);

  useEffect(() => {
    loadPanel(activePanel);
  }, [activePanel, loadPanel]);

  function handleSend() {
    const text = inputVal.trim();
    if (!text || isLoading) return;
    sendMessage(text);
    setInputVal("");
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function saveSchedule() {
    if (!schedEdit.cron_expr) return;
    setSchedSaving(true);
    try {
      await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: name, ...schedEdit }),
      });
      setSchedSaved(true);
      setTimeout(() => setSchedSaved(false), 2000);
    } finally {
      setSchedSaving(false);
    }
  }

  async function triggerNow() {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
    await fetch(`${apiBase}/schedules/${name}/trigger`, { method: "POST" });
  }

  async function resolveHitl(id: number, decision: "approved" | "rejected") {
    await fetch(`/api/hitl/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setHitlItems((prev) => prev.filter((x) => x.id !== id));
  }

  if (!cfg) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <p className="text-muted-foreground text-sm">Unknown agent: <code className="font-mono text-xs">{name}</code></p>
      <p className="text-[11px] text-muted-foreground/60">Check the agent name or return to the dashboard.</p>
    </div>
  );

  const Icon = cfg.icon;

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden -m-6">
      {/* ── Chat panel ── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-border">
        {/* Agent header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-border shrink-0">
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${cfg.accentColor}18`, border: `1px solid ${cfg.accentColor}30` }}
          >
            <Icon className="h-4 w-4" style={{ color: cfg.accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{cfg.displayName}</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 font-mono h-4"
                style={{ borderColor: `${cfg.accentColor}40`, color: cfg.accentColor }}
              >
                agent
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{cfg.description}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setPanelOpen((o) => !o)}
          >
            {panelOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
              <div
                className="h-14 w-14 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${cfg.accentColor}18`, border: `1px solid ${cfg.accentColor}30` }}
              >
                <Icon className="h-7 w-7" style={{ color: cfg.accentColor }} />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">Chat with {cfg.displayName}</p>
                <p className="text-[12px] text-muted-foreground max-w-xs">
                  {cfg.description}. Send a message to get started.
                </p>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              role={msg.role}
              content={msg.content}
              thinking={msg.thinking}
              streaming={msg.streaming}
              accentColor={cfg.accentColor}
            />
          ))}

          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 px-5 py-3 border-t border-border bg-background">
          <div className="relative flex gap-2">
            <Textarea
              ref={inputRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Message ${cfg.displayName}…`}
              disabled={isLoading}
              rows={1}
              className="resize-none min-h-[40px] max-h-32 pr-12 text-sm bg-card border-border focus-visible:ring-1"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !inputVal.trim()}
              size="icon"
              className="h-10 w-10 shrink-0"
              style={{
                backgroundColor: inputVal.trim() ? cfg.accentColor : undefined,
                color: inputVal.trim() ? "black" : undefined,
              }}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground/50 mt-1.5 text-center">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* ── Right panel ── */}
      {panelOpen && (
        <div className="w-72 xl:w-80 shrink-0 flex flex-col overflow-hidden bg-card/50">
          {/* Panel tabs */}
          <div className="flex border-b border-border shrink-0">
            {([
              { id: "schedule", label: "Schedule", icon: CalendarClock },
              { id: "memory",   label: "Memory",   icon: BookOpen },
              { id: "hitl",     label: "HITL",     icon: Inbox },
            ] as const).map(({ id, label, icon: TabIcon }) => (
              <button
                key={id}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors",
                  activePanel === id
                    ? "border-b-2 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                style={activePanel === id ? { borderBottomColor: cfg.accentColor } : {}}
                onClick={() => setActivePanel(id)}
              >
                <TabIcon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto p-4">
            {activePanel === "schedule" && (
              <SchedulePanel
                schedule={schedule}
                schedEdit={schedEdit}
                setSchedEdit={setSchedEdit}
                onSave={saveSchedule}
                onTrigger={triggerNow}
                saving={schedSaving}
                saved={schedSaved}
                accentColor={cfg.accentColor}
              />
            )}
            {activePanel === "memory" && (
              <MemoryPanel memory={memory} loading={panelLoading} accentColor={cfg.accentColor} />
            )}
            {activePanel === "hitl" && (
              <HitlPanel items={hitlItems} loading={panelLoading} onResolve={resolveHitl} accentColor={cfg.accentColor} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Chat message ───────────────────────────────────────────────

function ChatMessage({
  role, content, thinking, streaming, accentColor,
}: {
  role: string; content: string; thinking?: string;
  streaming?: boolean; accentColor: string;
}) {
  const isUser = role === "human";

  return (
    <div className={cn("flex gap-3 max-w-3xl", isUser ? "ml-auto flex-row-reverse" : "")}>
      {/* Avatar */}
      <div
        className={cn(
          "h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 border",
          isUser
            ? "bg-muted border-border"
            : "border-[var(--border)]"
        )}
        style={!isUser ? { backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30` } : {}}
      >
        {isUser
          ? <User className="h-3.5 w-3.5 text-muted-foreground" />
          : <Bot className="h-3.5 w-3.5" style={{ color: accentColor }} />
        }
      </div>

      <div className={cn("flex-1 space-y-1.5 min-w-0", isUser ? "items-end flex flex-col" : "")}>
        {/* Thinking */}
        {thinking && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none text-muted-foreground/60 hover:text-muted-foreground">
              reasoning…
            </summary>
            <p className="mt-1 pl-2 border-l border-border/60 text-muted-foreground/70 whitespace-pre-wrap">{thinking}</p>
          </details>
        )}

        {/* Content */}
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm leading-relaxed",
            isUser
              ? "bg-muted text-foreground"
              : "bg-card border border-border"
          )}
        >
          {content ? (
            <div className="prose prose-sm prose-invert max-w-none break-words">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : streaming ? (
            <div className="flex items-center gap-1 h-5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          ) : null}
          {streaming && content && (
            <span className="inline-block w-0.5 h-4 bg-current animate-pulse ml-0.5 align-middle opacity-70" />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Panel sub-components ────────────────────────────────────────

function SchedulePanel({
  schedule, schedEdit, setSchedEdit, onSave, onTrigger, saving, saved, accentColor,
}: {
  schedule: Schedule | null;
  schedEdit: Partial<Schedule>;
  setSchedEdit: React.Dispatch<React.SetStateAction<Partial<Schedule>>>;
  onSave: () => void;
  onTrigger: () => void;
  saving: boolean;
  saved: boolean;
  accentColor: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Background schedule</p>
        <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 px-2" onClick={onTrigger}>
          <Play className="h-2.5 w-2.5" /> Run now
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1.5">Cron expression</label>
          <input
            type="text"
            value={schedEdit.cron_expr ?? ""}
            onChange={(e) => setSchedEdit((p) => ({ ...p, cron_expr: e.target.value }))}
            className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="*/30 * * * *"
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setSchedEdit((prev) => ({ ...prev, cron_expr: p.value }))}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors font-mono"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] text-muted-foreground block mb-1.5">Task prompt</label>
          <Textarea
            value={schedEdit.task_prompt ?? ""}
            onChange={(e) => setSchedEdit((p) => ({ ...p, task_prompt: e.target.value }))}
            placeholder="Instructions for scheduled runs…"
            rows={4}
            className="text-sm bg-background border-border resize-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setSchedEdit((p) => ({ ...p, enabled: p.enabled ? 0 : 1 }))}
            className={cn(
              "text-[11px] px-3 py-1 rounded-full border font-mono transition-colors",
              schedEdit.enabled
                ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                : "border-border text-muted-foreground"
            )}
          >
            {schedEdit.enabled ? "● enabled" : "○ disabled"}
          </button>
        </div>

        <Button
          className="w-full h-8 text-xs gap-1.5"
          disabled={saving}
          onClick={onSave}
          style={saved ? {} : { backgroundColor: accentColor, color: "black" }}
        >
          {saved ? <><Check className="h-3 w-3" /> Saved</> : saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : "Save schedule"}
        </Button>
      </div>

      {schedule?.last_run && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 font-mono">
          <Clock className="h-2.5 w-2.5" />
          <span>Last run: {new Date(schedule.last_run).toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}

function MemoryPanel({
  memory, loading, accentColor,
}: {
  memory: { memory: string; rules: string } | null;
  loading: boolean;
  accentColor: string;
}) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!memory) return (
    <p className="text-[12px] text-muted-foreground text-center py-8">
      No memory files found. The agent will create them during runs.
    </p>
  );
  return (
    <div className="space-y-4">
      {memory.memory && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2">MEMORY.md</p>
          <pre className="text-[11px] font-mono text-foreground/70 whitespace-pre-wrap break-all bg-muted/40 rounded-md p-3 leading-relaxed max-h-48 overflow-y-auto">
            {memory.memory}
          </pre>
        </div>
      )}
      {memory.rules && (
        <div>
          <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-2">RULES.md</p>
          <pre className="text-[11px] font-mono text-foreground/70 whitespace-pre-wrap break-all bg-muted/40 rounded-md p-3 leading-relaxed max-h-48 overflow-y-auto">
            {memory.rules}
          </pre>
        </div>
      )}
    </div>
  );
}

function HitlPanel({
  items, loading, onResolve, accentColor,
}: {
  items: HitlItem[];
  loading: boolean;
  onResolve: (id: number, decision: "approved" | "rejected") => void;
  accentColor: string;
}) {
  if (loading) return <Skeleton className="h-20 w-full" />;
  const pending = items.filter((x) => x.status === "pending");
  if (pending.length === 0) return (
    <div className="text-center py-8">
      <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
      <p className="text-[12px] text-muted-foreground">No pending items</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {pending.map((item) => {
        let payload: unknown = item.payload;
        try { payload = JSON.parse(item.payload); } catch {}
        return (
          <div key={item.id} className="border border-border rounded-md p-3 space-y-2">
            <p className="text-[11px] text-muted-foreground font-mono">
              {new Date(item.created_at).toLocaleString()}
            </p>
            <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {typeof payload === "object" ? JSON.stringify(payload, null, 2) : String(payload)}
            </pre>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                onClick={() => onResolve(item.id, "approved")}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-7 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => onResolve(item.id, "rejected")}
              >
                Reject
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

