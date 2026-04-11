"use client";

import { useCallback, useEffect, useState } from "react";
import { Client } from "@langchain/langgraph-sdk";
import type { Thread } from "@langchain/langgraph-sdk";
import { RotateCw, Plus, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThreadHistoryProps {
  apiUrl: string;
  currentThreadId: string;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  accentColor: string;
  /** Bump this to trigger a refresh after submitting a message */
  refreshKey?: number;
}

export function ThreadHistory({
  apiUrl,
  currentThreadId,
  onSelect,
  onNew,
  accentColor,
  refreshKey,
}: ThreadHistoryProps) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const client = new Client({ apiUrl });
      const results = await client.threads.search({
        limit: 30,
        sortBy: "updated_at",
      });
      // newest first
      setThreads(results.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ));
    } catch {
      // agent offline — show empty state
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <aside className="w-64 xl:w-72 shrink-0 flex flex-col border-l border-border bg-card/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <MessageSquare className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground flex-1">
          Thread History
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
          title="New thread"
          onClick={onNew}
        >
          <Plus className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
          title="Refresh"
          onClick={load}
        >
          <RotateCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <div className="px-3 py-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 rounded-md bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 px-6 text-center">
            <p className="text-[11px] text-muted-foreground/40 italic">
              No threads yet. Send a message to start one.
            </p>
          </div>
        ) : (
          threads.map((t) => {
            const isCurrent = t.thread_id === currentThreadId;
            const firstMsg = getFirstHumanMessage(t);
            const time = formatTime(t.updated_at);

            return (
              <button
                key={t.thread_id}
                onClick={() => onSelect(t.thread_id)}
                className={cn(
                  "w-full text-left px-3 py-2 flex flex-col gap-0.5 rounded-sm mx-1 transition-colors",
                  isCurrent
                    ? "bg-muted/50"
                    : "hover:bg-muted/30"
                )}
                style={isCurrent ? { borderLeft: `2px solid ${accentColor}`, paddingLeft: "10px" } : {}}
              >
                <span className="text-[11px] text-foreground/80 truncate leading-snug">
                  {firstMsg ?? t.thread_id.slice(0, 8) + "…"}
                </span>
                <span className="text-[10px] text-muted-foreground/50 font-mono">
                  {time}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div
        className="h-[2px] shrink-0"
        style={{ background: `linear-gradient(to right, ${accentColor}60, transparent)` }}
      />
    </aside>
  );
}

function getFirstHumanMessage(thread: Thread): string | null {
  const messages = (thread.values as Record<string, unknown> | null)?.messages;
  if (!Array.isArray(messages)) return null;
  const first = messages.find(
    (m): m is { type: string; content: unknown } =>
      typeof m === "object" && m !== null && (m as Record<string, unknown>).type === "human"
  );
  if (!first) return null;
  const content = first.content;
  if (typeof content === "string") return content.slice(0, 60);
  if (Array.isArray(content)) {
    const text = content.find((c) => (c as Record<string, unknown>).type === "text");
    return text ? String((text as Record<string, unknown>).text ?? "").slice(0, 60) : null;
  }
  return null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString();
}
