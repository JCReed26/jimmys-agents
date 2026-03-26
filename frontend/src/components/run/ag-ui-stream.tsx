"use client";

import { useAgUiStream, RunStatus, AgUiStep } from "@/hooks/use-ag-ui-stream";
import { cn } from "@/lib/utils";
import { Cpu, CheckCircle2, XCircle, Loader2, Wifi, WifiOff } from "lucide-react";

interface AgUiStreamProps {
  agent: string;
  accentColor?: string;
  className?: string;
  compact?: boolean;
}

export function AgUiStream({ agent, accentColor = "var(--agent-calendar)", className, compact }: AgUiStreamProps) {
  const { messages, toolCalls, steps, runStatus, connected, error } = useAgUiStream(agent);
  const isEmpty = messages.length === 0 && toolCalls.length === 0 && steps.length === 0;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Status bar */}
      <div className="flex items-center gap-3">
        {connected ? (
          <Wifi className="h-3 w-3 text-emerald-500" />
        ) : (
          <WifiOff className="h-3 w-3 text-muted-foreground/50" />
        )}
        <span className="text-[11px] text-muted-foreground font-mono">
          {connected ? "live" : "disconnected"}
        </span>
        <StatusPill status={runStatus} />
        {runStatus === "running" && (
          <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
        )}
      </div>

      {/* Step flow */}
      {steps.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-1">
              <StepBadge step={step} accentColor={accentColor} />
              {i < steps.length - 1 && (
                <span className="text-muted-foreground/30 text-[10px] font-mono">→</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Events */}
      <div
        className={cn(
          "space-y-1.5 overflow-y-auto font-mono",
          compact ? "max-h-48 text-[10px]" : "max-h-80 text-[11px]"
        )}
      >
        {isEmpty && (
          <div className="text-muted-foreground/40 text-center py-6 text-[11px]">
            {connected ? "waiting for run activity…" : "no active run"}
          </div>
        )}

        {toolCalls.map((tc) => (
          <div key={tc.id} className="border border-border/60 rounded-md p-2 bg-card/40">
            <div className="flex items-center gap-2 mb-1.5">
              <Cpu className="h-3 w-3 shrink-0" style={{ color: accentColor }} />
              <span style={{ color: accentColor }} className="font-medium">
                {tc.name}
              </span>
              {tc.streaming && (
                <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground ml-auto" />
              )}
            </div>
            {tc.args && (
              <pre className="text-muted-foreground/70 whitespace-pre-wrap break-all leading-relaxed">
                {truncate(tc.args, compact ? 120 : 300)}
              </pre>
            )}
            {tc.result !== undefined && (
              <div className="mt-1.5 pt-1.5 border-t border-border/40 text-foreground/60 break-all">
                {truncate(tc.result, compact ? 120 : 300)}
              </div>
            )}
          </div>
        ))}

        {messages.map((m) => (
          <div key={m.id} className="text-foreground/70 leading-relaxed py-0.5">
            {m.content || (
              <span className="text-muted-foreground/40 italic">thinking…</span>
            )}
            {m.streaming && (
              <span className="inline-block w-0.5 h-3 bg-foreground/40 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        ))}

        {error && (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-3 w-3 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StepBadge({ step, accentColor }: { step: AgUiStep; accentColor: string }) {
  const running = step.status === "running";
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-mono",
        running
          ? "border-amber-500/40 text-amber-400 bg-amber-500/10"
          : "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
      )}
    >
      {running ? (
        <Loader2 className="h-2 w-2 animate-spin" />
      ) : (
        <CheckCircle2 className="h-2 w-2" />
      )}
      {step.name}
      {step.finishedAt && step.startedAt && (
        <span className="opacity-60 ml-0.5">
          {((step.finishedAt - step.startedAt) / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  if (status === "idle") return null;
  const map: Record<string, string> = {
    running: "border-amber-500/40 text-amber-400",
    completed: "border-emerald-500/40 text-emerald-400",
    error: "border-destructive/50 text-destructive",
  };
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-mono", map[status])}>
      {status}
    </span>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
