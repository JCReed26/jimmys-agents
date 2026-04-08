"use client";

import "@copilotkit/react-ui/styles.css";
import React, { use, useEffect, useState, useCallback } from "react";
import { AGENTS, AgentConfig } from "@/lib/agents";
import { CopilotKit } from "@copilotkit/react-core";
import { CopilotChat } from "@copilotkit/react-ui";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, PanelRightClose, PanelRightOpen, RotateCw } from "lucide-react";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AgentPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const cfg = AGENTS[name];

  if (!cfg) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-center">
        <p className="text-muted-foreground text-sm">
          Unknown agent: <code className="font-mono text-xs">{name}</code>
        </p>
        <p className="text-[11px] text-muted-foreground/60">
          Add it to <code className="font-mono">src/lib/agents.ts</code> to enable it.
        </p>
      </div>
    );
  }

  return (
    <CopilotKit runtimeUrl="/api/copilotkit" agent={name}>
      <AgentHarness agentName={name} cfg={cfg} />
    </CopilotKit>
  );
}

// ── Inner harness ─────────────────────────────────────────────────────────────

function AgentHarness({ agentName, cfg }: { agentName: string; cfg: AgentConfig }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentsMd, setAgentsMd] = useState<string | null>(null);
  const [chatKey, setChatKey] = useState(0);
  const Icon = cfg.icon;

  const loadMemory = useCallback(() => {
    fetch(`/api/agents-md/${agentName}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { content: "" }))
      .then((d) => setAgentsMd(d.content ?? ""))
      .catch(() => setAgentsMd(""));
  }, [agentName]);

  useEffect(() => { loadMemory(); }, [loadMemory]);

  function handleNewThread() {
    setChatKey((k) => k + 1);
  }

  return (
    // --agent-accent flows into CopilotKit CSS vars (--copilot-kit-primary-color uses it)
    <div
      className="flex h-[calc(100vh-3rem)] overflow-hidden -m-6"
      style={{ "--agent-accent": cfg.accentColor } as React.CSSProperties}
    >
      {/* ── Chat column ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Agent header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-card/30">
          {/* Icon with accent glow */}
          <div
            className="relative h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `${cfg.accentColor}12`,
              border: `1px solid ${cfg.accentColor}30`,
              boxShadow: `0 0 14px ${cfg.accentColor}18`,
            }}
          >
            <Icon className="h-4 w-4" style={{ color: cfg.accentColor }} />
            {/* Online dot */}
            <span
              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
              style={{
                background: cfg.accentColor,
                boxShadow: `0 0 6px ${cfg.accentColor}`,
              }}
            />
          </div>

          {/* Name + description */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm text-foreground">{cfg.displayName}</span>
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 font-mono h-4 shrink-0"
                style={{ borderColor: `${cfg.accentColor}35`, color: cfg.accentColor }}
              >
                :{cfg.port}
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground/70 truncate leading-tight mt-0.5">
              {cfg.description}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title="New thread"
              onClick={handleNewThread}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title={sidebarOpen ? "Hide memory" : "Show memory"}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              {sidebarOpen
                ? <PanelRightClose className="h-3.5 w-3.5" />
                : <PanelRightOpen className="h-3.5 w-3.5" />
              }
            </Button>
          </div>
        </header>

        {/* CopilotKit chat — fills remaining height */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <CopilotChat
            key={chatKey}
            className="h-full"
            labels={{
              title: "",
              initial: `Hi! I'm your **${cfg.displayName}** agent. What can I help you with?`,
              placeholder: `Message ${cfg.displayName}…`,
            }}
            instructions={`You are the ${cfg.displayName} agent. Use your tools to help the user.`}
          />
        </div>
      </div>

      {/* ── Memory sidebar ────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <aside className="w-72 xl:w-80 shrink-0 flex flex-col border-l border-border bg-card/20 overflow-hidden">
          {/* Sidebar header */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
            <BookOpen className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex-1">
              AGENTS.md
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
              title="Refresh"
              onClick={loadMemory}
            >
              <RotateCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <MemoryPanel agentsMd={agentsMd} accentColor={cfg.accentColor} />
          </div>

          {/* Footer — accent bar */}
          <div
            className="h-[2px] shrink-0"
            style={{ background: `linear-gradient(to right, ${cfg.accentColor}60, transparent)` }}
          />
        </aside>
      )}
    </div>
  );
}

// ── Memory panel ──────────────────────────────────────────────────────────────

function MemoryPanel({ agentsMd, accentColor }: { agentsMd: string | null; accentColor: string }) {
  if (agentsMd === null) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-full mt-4" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (!agentsMd) {
    return (
      <div className="flex flex-col items-center justify-center h-32 px-6 gap-2 text-center">
        <div
          className="h-6 w-6 rounded-md flex items-center justify-center opacity-30"
          style={{ background: `${accentColor}20`, border: `1px solid ${accentColor}30` }}
        >
          <BookOpen className="h-3 w-3" style={{ color: accentColor }} />
        </div>
        <p className="text-[11px] text-muted-foreground/40 italic leading-relaxed">
          Empty — the agent will populate this during runs.
        </p>
      </div>
    );
  }

  return (
    <pre className="text-[11px] font-mono text-foreground/60 whitespace-pre-wrap leading-relaxed p-4 break-words">
      {agentsMd}
    </pre>
  );
}
