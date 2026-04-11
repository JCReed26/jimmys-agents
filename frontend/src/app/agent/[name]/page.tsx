"use client";

import React, { use, useEffect, useRef, useState } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { AGENTS, AgentConfig, getAgentUrl } from "@/lib/agents";
import { TodoList } from "@/components/TodoList";
import { SubagentCard } from "@/components/SubagentCard";
import { ThreadHistory } from "@/components/ThreadHistory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PanelRightClose, PanelRightOpen, RotateCw, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";

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

  return <AgentHarness agentName={name} cfg={cfg} />;
}

// ── Inner harness ─────────────────────────────────────────────────────────────

function AgentHarness({ agentName: _agentName, cfg }: { agentName: string; cfg: AgentConfig }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [input, setInput] = useState("");
  // null = new thread (useStream creates one on first submit)
  // string = selected existing thread
  const [threadId, setThreadId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const Icon = cfg.icon;

  type AgentState = {
    messages: Array<{ type?: string; id?: string; content?: unknown }>;
    todos?: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
  };

  // filterSubagentMessages is supported at runtime but only typed for deep agent types.
  // Using `as any` here is intentional — the option exists in the JS impl but not in
  // the generic UseStreamOptions TypeScript overload.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streamRaw = useStream<AgentState>({
    apiUrl: getAgentUrl(cfg),
    assistantId: cfg.graphId,
    threadId,
    reconnectOnMount: true,
    fetchStateHistory: true,
    filterSubagentMessages: true,
    // Sync created thread ID back to sidebar after first submit
    onThreadId: (id: string) => { setThreadId(id); setRefreshKey((k) => k + 1); },
  } as any);

  // Cast to include subagent API which is available at runtime via deepagents middleware
  const stream = streamRaw as typeof streamRaw & {
    getSubagentsByMessage: (messageId: string) => unknown[];
  };

  const todos = stream.values?.todos ?? [];
  const messages = stream.values?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function handleNewThread() {
    setThreadId(null);   // null → useStream starts a new thread on next submit
    setInput("");
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || stream.isLoading) return;
    stream.submit(
      { messages: [{ type: "human", content: input.trim() }] },
      { streamSubgraphs: true, config: { recursion_limit: 10000 } },
    );
    setInput("");
    // onThreadId handles refreshKey bump for new threads;
    // for existing threads bump immediately so sidebar reflects the update
    if (threadId) setTimeout(() => setRefreshKey((k) => k + 1), 2000);
  }

  // Index of the last AI message (for todo list placement)
  const lastAiIdx = messages.reduce(
    (last, msg, i) => (msg.type === "ai" ? i : last),
    -1,
  );

  return (
    <div
      className="flex h-[calc(100vh-3rem)] overflow-hidden -m-6"
      style={{ "--agent-accent": cfg.accentColor } as React.CSSProperties}
    >
      {/* ── Chat column ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Agent header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-card/30">
          <div
            className="relative h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: `${cfg.accentColor}12`,
              border: `1px solid ${cfg.accentColor}30`,
              boxShadow: `0 0 14px ${cfg.accentColor}18`,
            }}
          >
            <Icon className="h-4 w-4" style={{ color: cfg.accentColor }} />
            <span
              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full"
              style={{ background: cfg.accentColor, boxShadow: `0 0 6px ${cfg.accentColor}` }}
            />
          </div>
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
              title={sidebarOpen ? "Hide thread history" : "Show thread history"}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              {sidebarOpen
                ? <PanelRightClose className="h-3.5 w-3.5" />
                : <PanelRightOpen className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </header>

        {/* Messages + subagent cards + todo list */}
        <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-2">
          {messages.length === 0 && !stream.isLoading && (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground/50">
                Hi! I&apos;m your <strong>{cfg.displayName}</strong> agent. What can I help with?
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            const isHuman = msg.type === "human";
            const isAI = msg.type === "ai";
            if (!isHuman && !isAI) return null;

            const text =
              typeof msg.content === "string"
                ? msg.content
                : Array.isArray(msg.content)
                ? (msg.content as Array<{ type: string; text?: string }>)
                    .filter((c) => c.type === "text")
                    .map((c) => c.text ?? "")
                    .join("")
                : "";

            if (!text && !isAI) return null;

            const subagents = msg.id ? stream.getSubagentsByMessage(msg.id) : [];

            return (
              <React.Fragment key={msg.id ?? i}>
                {text && (
                  <div className={`flex ${isHuman ? "justify-end" : "justify-start"} px-4`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        isHuman
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                      data-testid={isAI ? "ai-message" : "human-message"}
                    >
                      {isAI ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
                          <ReactMarkdown>{text}</ReactMarkdown>
                        </div>
                      ) : (
                        text
                      )}
                    </div>
                  </div>
                )}

                {subagents.length > 0 && (
                  <SubagentCard subagents={subagents as never} accentColor={cfg.accentColor} />
                )}

                {/* Todo list shown below the last AI message */}
                {isAI && i === lastAiIdx && todos.length > 0 && (
                  <TodoList todos={todos} accentColor={cfg.accentColor} />
                )}
              </React.Fragment>
            );
          })}

          {stream.isLoading && (
            <div className="px-4">
              <div className="flex gap-1 items-center">
                <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: cfg.accentColor, animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: cfg.accentColor, animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: cfg.accentColor, animationDelay: "300ms" }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Chat input */}
        <form
          onSubmit={handleSubmit}
          className="shrink-0 border-t border-border px-4 py-3 flex gap-2 bg-card/30"
        >
          <textarea
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 min-h-[40px] max-h-32"
            placeholder={`Message ${cfg.displayName}…`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            disabled={stream.isLoading}
            rows={1}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || stream.isLoading}
            className="shrink-0 h-10 w-10"
            style={{ background: cfg.accentColor }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>

      {/* ── Thread history sidebar ────────────────────────────────────────── */}
      {sidebarOpen && (
        <ThreadHistory
          apiUrl={getAgentUrl(cfg)}
          currentThreadId={threadId ?? ""}
          onSelect={(id) => { setThreadId(id); setInput(""); }}
          onNew={handleNewThread}
          accentColor={cfg.accentColor}
          refreshKey={refreshKey}
        />
      )}
    </div>
  );
}

