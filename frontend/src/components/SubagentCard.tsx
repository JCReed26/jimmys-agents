"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SubagentMessage {
  type?: string;
  content?: string | Array<{ type: string; text?: string }>;
}

interface SubagentStream {
  id: string;
  status: "pending" | "running" | "complete" | "error";
  messages: SubagentMessage[];
  result?: string;
  toolCall?: {
    args?: { description?: string; subagent_type?: string };
  };
  startedAt?: Date;
  completedAt?: Date;
}

interface SubagentCardProps {
  subagents: SubagentStream[];
  accentColor: string;
}

export function SubagentCard({ subagents, accentColor }: SubagentCardProps) {
  if (!subagents || subagents.length === 0) return null;

  return (
    <div className="mx-4 my-1 space-y-1">
      {subagents.map((sub) => (
        <SingleSubagentCard key={sub.id} sub={sub} accentColor={accentColor} />
      ))}
    </div>
  );
}

function SingleSubagentCard({
  sub,
  accentColor,
}: {
  sub: SubagentStream;
  accentColor: string;
}) {
  const [open, setOpen] = useState(sub.status !== "complete");
  const name = sub.toolCall?.args?.subagent_type ?? "subagent";
  const description = sub.toolCall?.args?.description ?? "";

  const statusColor =
    sub.status === "complete"
      ? "#22c55e"
      : sub.status === "error"
      ? "#ef4444"
      : sub.status === "running"
      ? accentColor
      : "var(--color-muted-foreground)";

  return (
    <div
      className="rounded-md border overflow-hidden"
      style={{ borderColor: `${accentColor}20` }}
      data-testid="subagent-card"
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen((o) => !o)}
        style={{ background: `${accentColor}08` }}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{
            background: statusColor,
            boxShadow:
              sub.status === "running" ? `0 0 6px ${statusColor}` : "none",
          }}
        />
        <span className="text-[11px] font-medium text-foreground/80">{name}</span>
        <span className="text-[10px] text-muted-foreground/60 flex-1 truncate">
          {description}
        </span>
        <span
          className="text-[9px] font-mono shrink-0"
          style={{ color: statusColor }}
        >
          {sub.status}
        </span>
      </button>

      {/* Messages — collapsible */}
      {open && (
        <div className="px-3 py-2 space-y-1 border-t" style={{ borderColor: `${accentColor}15` }}>
          {sub.messages.length === 0 && (
            <p className="text-[10px] text-muted-foreground/40 italic">
              {sub.status === "pending" ? "Waiting to start…" : "Running…"}
            </p>
          )}
          {sub.messages.map((msg, i) => {
            const text =
              typeof msg.content === "string"
                ? msg.content
                : Array.isArray(msg.content)
                ? msg.content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text)
                    .join("")
                : "";
            if (!text) return null;
            return (
              <p
                key={i}
                className="text-[10px] text-foreground/60 leading-relaxed line-clamp-3"
              >
                {text}
              </p>
            );
          })}
          {sub.result && (
            <p className="text-[10px] text-foreground/80 leading-relaxed border-t pt-1 mt-1"
               style={{ borderColor: `${accentColor}15` }}>
              {sub.result.slice(0, 300)}
              {sub.result.length > 300 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
