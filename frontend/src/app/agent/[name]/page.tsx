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
  Bot, User, RotateCw, Clock, CheckCircle2, DollarSign, Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  const { 
    messages, sendMessage, isLoading, error, 
    threads, currentThreadId, switchThread, startNewThread, isInitializing 
  } = useAgentChat(name);
  const [panelOpen, setPanelOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<"memory" | "history">("memory");
  const [inputVal, setInputVal] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Panel data
  const [agentsMd, setAgentsMd] = useState<string>("");
  const [agentsMdEditing, setAgentsMdEditing] = useState(false);
  const [agentsMdDraft, setAgentsMdDraft] = useState("");
  const [agentsMdSaving, setAgentsMdSaving] = useState(false);
  const [agentsMdSaved, setAgentsMdSaved] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadPanel = useCallback(async (panel: typeof activePanel) => {
    setPanelLoading(true);
    try {
      if (panel === "memory") {
        const r = await fetch(`/api/agents-md/${name}`, { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setAgentsMd(data.content ?? "");
          setAgentsMdDraft(data.content ?? "");
        }
      } else if (panel === "history") {
        const r = await fetch(`/api/runs/${name}?limit=10`, { cache: "no-store" });
        if (r.ok) {
          const data = await r.json();
          setHistory(data);
        }
      }
    } finally {
      setPanelLoading(false);
    }
  }, [name]);

  async function saveAgentsMd() {
    setAgentsMdSaving(true);
    try {
      const r = await fetch(`/api/agents-md/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: agentsMdDraft }),
      });
      if (r.ok) {
        setAgentsMd(agentsMdDraft);
        setAgentsMdEditing(false);
        setAgentsMdSaved(true);
        setTimeout(() => setAgentsMdSaved(false), 2000);
      }
    } finally {
      setAgentsMdSaving(false);
    }
  }

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
        <div className="shrink-0 px-5 py-3 border-t border-border bg-background flex flex-col gap-2">
          {/* Thread picker */}
          <div className="flex items-center gap-2 px-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 py-0 font-mono text-muted-foreground hover:text-foreground">
                  {isInitializing ? (
                     <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  ) : (
                     <Clock className="h-3 w-3 mr-1.5" />
                  )}
                  {threads.find(t => t.id === currentThreadId)?.label || "Select thread"}
                  <ChevronRight className="h-3 w-3 ml-1 rotate-90" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 bg-card border-border">
                <div className="max-h-64 overflow-y-auto">
                  {threads.map((t) => (
                    <DropdownMenuItem 
                      key={t.id} 
                      onClick={() => switchThread(t.id)}
                      className={cn(
                        "text-xs cursor-pointer",
                        t.id === currentThreadId && "bg-muted font-medium text-foreground"
                      )}
                    >
                      <div className="flex flex-col gap-0.5 w-full">
                        <span>{t.label}</span>
                        <span className="text-[9px] text-muted-foreground/70 font-mono">
                          {new Date(t.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {t.id === currentThreadId && <Check className="h-3 w-3 ml-auto text-muted-foreground" />}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem 
                  onClick={startNewThread}
                  className="text-xs cursor-pointer text-blue-500 font-medium focus:text-blue-500"
                >
                  + New conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {isInitializing && (
               <span className="text-[10px] text-muted-foreground/50 animate-pulse">Loading history...</span>
            )}
          </div>
          
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
              { id: "memory",   label: "Memory",   icon: BookOpen },
              { id: "history",  label: "Run History", icon: Clock },
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
            {activePanel === "memory" && (
              <MemoryPanel
                content={agentsMd}
                draft={agentsMdDraft}
                editing={agentsMdEditing}
                saving={agentsMdSaving}
                saved={agentsMdSaved}
                loading={panelLoading}
                accentColor={cfg.accentColor}
                onEdit={() => setAgentsMdEditing(true)}
                onCancel={() => { setAgentsMdEditing(false); setAgentsMdDraft(agentsMd); }}
                onChange={setAgentsMdDraft}
                onSave={saveAgentsMd}
              />
            )}
            {activePanel === "history" && (
              <HistoryPanel history={history} loading={panelLoading} accentColor={cfg.accentColor} />
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

function MemoryPanel({
  content, draft, editing, saving, saved, loading, accentColor,
  onEdit, onCancel, onChange, onSave,
}: {
  content: string;
  draft: string;
  editing: boolean;
  saving: boolean;
  saved: boolean;
  loading: boolean;
  accentColor: string;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (s: string) => void;
  onSave: () => void;
}) {
  if (loading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">AGENTS.md</p>
        {!editing && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <>
          <Textarea
            value={draft}
            onChange={(e) => onChange(e.target.value)}
            rows={18}
            className="text-xs font-mono bg-background border-border resize-none"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-7 text-xs gap-1"
              disabled={saving}
              onClick={onSave}
              style={saved ? {} : { backgroundColor: accentColor, color: "black" }}
            >
              {saved ? <><Check className="h-3 w-3" /> Saved</> : saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</> : "Save"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <pre className="text-[11px] font-mono text-foreground/70 whitespace-pre-wrap bg-muted/40 rounded-md p-3 leading-relaxed overflow-y-auto max-h-[calc(100vh-20rem)]">
          {content || <span className="text-muted-foreground/40 italic">Empty — the agent will populate this during runs.</span>}
        </pre>
      )}
    </div>
  );
}

function HistoryPanel({
  history, loading, accentColor,
}: {
  history: any[];
  loading: boolean;
  accentColor: string;
}) {
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!history || history.length === 0) return (
    <p className="text-[12px] text-muted-foreground text-center py-8">
      No run history found.
    </p>
  );
  return (
    <div className="space-y-3">
      {history.map((run) => (
        <div key={run.id} className="border border-border rounded-md p-3 space-y-1.5 bg-card">
          <div className="flex items-center justify-between mb-1">
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-mono uppercase tracking-wider font-semibold",
              run.status === "success" || run.status === "done" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
              run.status === "error" ? "bg-destructive/10 text-destructive border border-destructive/20" :
              "bg-muted text-muted-foreground border border-border"
            )}>
              {run.status}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {new Date(run.started_at).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {run.cost_usd !== undefined && (
              <span className="flex items-center"><DollarSign className="w-3 h-3 mr-0.5" />{Number(run.cost_usd).toFixed(4)}</span>
            )}
            {run.total_tokens !== undefined && (
              <span className="flex items-center"><Activity className="w-3 h-3 mr-0.5" />{run.total_tokens}</span>
            )}
          </div>
          {run.langsmith_run_id && (
             <a
               href={`https://smith.langchain.com/`}
               target="_blank"
               rel="noopener noreferrer"
               className="text-[10px] text-blue-500 hover:underline block truncate mt-1 pt-1 border-t border-border/50"
             >
               Trace: {run.langsmith_run_id}
             </a>
          )}
        </div>
      ))}
    </div>
  );
}
