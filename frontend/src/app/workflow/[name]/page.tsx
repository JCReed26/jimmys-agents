"use client";

import { use, useEffect, useState, useCallback } from "react";
import { WORKFLOWS, AGENTS } from "@/lib/agents";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { useAgUiStream } from "@/hooks/use-ag-ui-stream";
import { AgUiStream } from "@/components/run/ag-ui-stream";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Play, Loader2, CheckCircle2, XCircle, Clock, ChevronDown,
  GitBranch, MessageSquare, Send, AlertTriangle, RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

// job-app-chain step graph definition
const WORKFLOW_STEPS: { id: string; label: string; desc: string; hitl?: boolean }[] = [
  { id: "sheets_reader",  label: "Sheets Reader", desc: "Read job listings from Google Sheets" },
  { id: "scraper",        label: "Scraper",        desc: "Scrape job details from URLs" },
  { id: "classifier",     label: "Classifier",     desc: "Classify & score each job", hitl: true },
  { id: "optimizer",      label: "Optimizer",      desc: "Optimize application materials", hitl: true },
  { id: "sheets_writer",  label: "Sheets Writer",  desc: "Write results back to Sheets" },
];

// Component agents within job-app-chain that can receive memory updates
const COMPONENT_AGENTS = [
  { key: "classifier-agent",  label: "Classifier",  desc: "Adjusts how jobs are scored and filtered" },
  { key: "optimizer-agent",   label: "Optimizer",   desc: "Updates how application materials are crafted" },
];

interface HitlItem {
  id: number;
  agent: string;
  payload: string;
  created_at: string;
  status: string;
  step?: string;
}

interface RunRecord {
  id: number;
  agent: string;
  started_at: string;
  finished_at?: string;
  status: string;
  total_tokens?: number;
  total_cost?: number;
}

export default function WorkflowPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const cfg = WORKFLOWS[name];

  const stream = useAgUiStream(name);
  const [triggering, setTriggering] = useState(false);
  const [hitlItems, setHitlItems] = useState<HitlItem[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Memory chat
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(COMPONENT_AGENTS[0].key);
  const [chatInput, setChatInput] = useState("");
  const { messages, sendMessage, isLoading: chatLoading } = useAgentChat(selectedAgent);

  const loadData = useCallback(async () => {
    try {
      const [hitlRes, runsRes] = await Promise.allSettled([
        fetch(`/api/hitl?agent=${name}`, { cache: "no-store" }),
        fetch(`/api/hotl?agent=${name}&limit=10`, { cache: "no-store" }),
      ]);
      if (hitlRes.status === "fulfilled" && hitlRes.value.ok) {
        const data = await hitlRes.value.json();
        setHitlItems(data.items ?? data ?? []);
      }
      if (runsRes.status === "fulfilled" && runsRes.value.ok) {
        const data = await runsRes.value.json();
        setRuns(data.logs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { loadData(); }, [loadData]);

  async function triggerRun() {
    setTriggering(true);
    try {
      await fetch(`http://localhost:8080/schedules/${name}/trigger`, { method: "POST" });
      stream.clearRun();
    } finally {
      setTriggering(false);
    }
  }

  async function resolveHitl(id: number, decision: "approved" | "rejected") {
    await fetch(`/api/hitl/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    setHitlItems((prev) => prev.filter((x) => x.id !== id));
  }

  function sendChat() {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    sendMessage(text);
    setChatInput("");
  }

  if (!cfg) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
      <p className="text-muted-foreground text-sm">Unknown workflow: <code className="font-mono text-xs">{name}</code></p>
      <p className="text-[11px] text-muted-foreground/60">Check the workflow name or return to the dashboard.</p>
    </div>
  );

  const Icon = cfg.icon;
  const pendingHitl = hitlItems.filter((x) => x.status === "pending");

  // Determine step states from the stream
  const activeSteps = new Set(stream.steps.filter((s) => s.status === "running").map((s) => s.name));
  const doneSteps = new Set(stream.steps.filter((s) => s.status === "completed").map((s) => s.name));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${cfg.accentColor}18`, border: `1px solid ${cfg.accentColor}30` }}
          >
            <Icon className="h-5 w-5" style={{ color: cfg.accentColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-base">{cfg.displayName}</h1>
              <Badge
                variant="outline"
                className="text-[10px] font-mono h-4"
                style={{ borderColor: `${cfg.accentColor}40`, color: cfg.accentColor }}
              >
                workflow
              </Badge>
            </div>
            <p className="text-[12px] text-muted-foreground">{cfg.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingHitl.length > 0 && (
            <Badge variant="destructive" className="font-mono text-xs">
              {pendingHitl.length} HITL pending
            </Badge>
          )}
          <Button
            onClick={triggerRun}
            disabled={triggering || stream.runStatus === "running"}
            size="sm"
            className="gap-2"
            style={{ backgroundColor: cfg.accentColor, color: "black" }}
          >
            {triggering || stream.runStatus === "running" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {stream.runStatus === "running" ? "Running…" : "Run workflow"}
          </Button>
        </div>
      </div>

      {/* Step graph */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium mb-5">Execution graph</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {WORKFLOW_STEPS.map((step, i) => {
              const isActive = activeSteps.has(step.id);
              const isDone = doneSteps.has(step.id);
              return (
                <div key={step.id} className="flex items-center gap-1 shrink-0">
                  <StepNode
                    step={step}
                    active={isActive}
                    done={isDone}
                    accentColor={cfg.accentColor}
                  />
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className="flex flex-col items-center gap-0.5">
                      <div className={cn(
                        "h-px w-8 transition-colors",
                        isDone ? "bg-emerald-500/60" : "bg-border"
                      )} />
                      {WORKFLOW_STEPS[i + 1].hitl && (
                        <div className="text-[8px] text-amber-400 font-mono -mt-1">HITL</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main grid: live stream + side panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Live stream */}
        <div className="lg:col-span-2">
          <Card className="bg-card border-border h-full">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium">Live stream</p>
                {stream.runStatus !== "idle" && (
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2 text-muted-foreground" onClick={stream.clearRun}>
                    <RotateCw className="h-2.5 w-2.5" /> clear
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <AgUiStream agent={name} accentColor={cfg.accentColor} />
            </CardContent>
          </Card>
        </div>

        {/* Side panel */}
        <div className="space-y-4">
          {/* HITL gates */}
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium mb-3">HITL Gates</p>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : pendingHitl.length === 0 ? (
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground py-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
                  No pending approvals
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingHitl.map((item) => {
                    let payload: unknown = item.payload;
                    try { payload = JSON.parse(item.payload); } catch {}
                    return (
                      <div key={item.id} className="border border-amber-500/20 bg-amber-500/5 rounded-md p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          <span className="text-[11px] text-amber-400 font-mono">
                            {item.step ?? item.agent} · {new Date(item.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                        <pre className="text-[10px] font-mono text-foreground/70 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                          {typeof payload === "object" ? JSON.stringify(payload, null, 2) : String(payload)}
                        </pre>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                            onClick={() => resolveHitl(item.id, "approved")}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 h-7 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => resolveHitl(item.id, "rejected")}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Run history */}
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium mb-3">Run history</p>
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : runs.length === 0 ? (
                <p className="text-[12px] text-muted-foreground py-3">No runs yet</p>
              ) : (
                <div className="space-y-1.5">
                  {runs.slice(0, 5).map((run) => (
                    <div key={run.id} className="flex items-center gap-2 text-[11px] font-mono">
                      <div className={cn(
                        "h-1.5 w-1.5 rounded-full shrink-0",
                        run.status === "error" ? "bg-destructive" : "bg-emerald-500"
                      )} />
                      <span className="text-muted-foreground flex-1 truncate">
                        {new Date(run.started_at).toLocaleDateString()}
                      </span>
                      {run.total_cost !== undefined && (
                        <span className="text-muted-foreground/60">${run.total_cost.toFixed(4)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Memory update chat drawer */}
      <Card className="bg-card border-border overflow-hidden">
        <button
          className="w-full flex items-center justify-between p-4 text-left"
          onClick={() => setChatOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Update agent memory</span>
            <span className="text-[11px] text-muted-foreground">(changes take effect on next run)</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", chatOpen && "rotate-180")} />
        </button>

        {chatOpen && (
          <div className="border-t border-border">
            <CardContent className="p-4 space-y-3">
              {/* Agent selector */}
              <div className="flex gap-2">
                {COMPONENT_AGENTS.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setSelectedAgent(a.key)}
                    className={cn(
                      "flex-1 text-[11px] py-1.5 rounded-md border transition-colors font-medium",
                      selectedAgent === a.key
                        ? "border-[var(--agent-job)] text-[var(--agent-job)] bg-[var(--agent-job)]/10"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {COMPONENT_AGENTS.find((a) => a.key === selectedAgent)?.desc}
              </p>

              {/* Chat messages */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={cn(
                      "text-[12px] px-3 py-2 rounded-md",
                      msg.role === "human"
                        ? "bg-muted text-foreground ml-8"
                        : "bg-card border border-border text-foreground/80 mr-8"
                    )}
                  >
                    {msg.content || <span className="italic text-muted-foreground/60">thinking…</span>}
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder={`Tell the ${COMPONENT_AGENTS.find((a) => a.key === selectedAgent)?.label} agent to update its behavior…`}
                  rows={2}
                  className="text-sm bg-background border-border resize-none"
                />
                <Button
                  onClick={sendChat}
                  disabled={chatLoading || !chatInput.trim()}
                  size="icon"
                  className="h-[72px] w-10 shrink-0"
                >
                  {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Step node ──────────────────────────────────────────────────

function StepNode({
  step, active, done, accentColor,
}: {
  step: { id: string; label: string; desc: string; hitl?: boolean };
  active: boolean;
  done: boolean;
  accentColor: string;
}) {
  const bg = active
    ? `${accentColor}20`
    : done
      ? "rgba(34,197,94,0.1)"
      : "var(--color-card)";
  const border = active
    ? `${accentColor}60`
    : done
      ? "rgba(34,197,94,0.4)"
      : "var(--color-border)";
  const textColor = active ? accentColor : done ? "#22c55e" : undefined;

  return (
    <div
      className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all min-w-[90px]"
      style={{ backgroundColor: bg, borderColor: border }}
    >
      <div className="flex items-center gap-1.5">
        {done ? (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        ) : active ? (
          <Loader2 className="h-3 w-3 animate-spin" style={{ color: accentColor }} />
        ) : (
          <div className="h-3 w-3 rounded-full border border-muted-foreground/40" />
        )}
        {step.hitl && !done && !active && (
          <div className="h-3 w-3 rounded-full border border-amber-500/40 bg-amber-500/10" />
        )}
      </div>
      <span
        className="text-[10px] font-medium text-center leading-tight"
        style={{ color: textColor }}
      >
        {step.label}
      </span>
    </div>
  );
}
