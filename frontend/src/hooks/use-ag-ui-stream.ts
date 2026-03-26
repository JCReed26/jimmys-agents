"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export type RunStatus = "idle" | "running" | "completed" | "error";

export interface AgUiMessage {
  id: string;
  role: "assistant";
  content: string;
  streaming: boolean;
}

export interface AgUiToolCall {
  id: string;
  name: string;
  args: string;
  result?: string;
  streaming: boolean;
}

export interface AgUiStep {
  name: string;
  status: "running" | "completed";
  startedAt: number;
  finishedAt?: number;
}

export interface AgUiStreamState {
  messages: AgUiMessage[];
  toolCalls: AgUiToolCall[];
  steps: AgUiStep[];
  runStatus: RunStatus;
  connected: boolean;
  error?: string;
  runCount: number;
}

const INITIAL: AgUiStreamState = {
  messages: [],
  toolCalls: [],
  steps: [],
  runStatus: "idle",
  connected: false,
  runCount: 0,
};

export function useAgUiStream(agent: string): AgUiStreamState & { clearRun: () => void } {
  const [state, setState] = useState<AgUiStreamState>(INITIAL);
  const esRef = useRef<EventSource | null>(null);
  const activeRef = useRef(true);

  const clearRun = useCallback(() => {
    setState((s) => ({ ...s, messages: [], toolCalls: [], steps: [], runStatus: "idle", error: undefined }));
  }, []);

  useEffect(() => {
    activeRef.current = true;

    function handleEvent(ev: Record<string, unknown>) {
      if (!activeRef.current) return;
      const type = ev.type as string;

      setState((s) => {
        switch (type) {
          case "RUN_STARTED":
            return { ...s, runStatus: "running", messages: [], toolCalls: [], steps: [], error: undefined, runCount: s.runCount + 1 };

          case "RUN_FINISHED":
            return {
              ...s,
              runStatus: ev.error ? "error" : "completed",
              error: ev.error as string | undefined,
            };

          case "TEXT_MESSAGE_START":
            return {
              ...s,
              messages: [
                ...s.messages,
                { id: ev.messageId as string, role: "assistant", content: "", streaming: true },
              ],
            };

          case "TEXT_MESSAGE_CONTENT":
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === ev.messageId ? { ...m, content: m.content + (ev.delta as string) } : m
              ),
            };

          case "TEXT_MESSAGE_END":
            return {
              ...s,
              messages: s.messages.map((m) =>
                m.id === ev.messageId ? { ...m, streaming: false } : m
              ),
            };

          case "TOOL_CALL_START":
            return {
              ...s,
              toolCalls: [
                ...s.toolCalls,
                { id: ev.toolCallId as string, name: ev.toolName as string, args: "", streaming: true },
              ],
            };

          case "TOOL_CALL_ARGS":
            return {
              ...s,
              toolCalls: s.toolCalls.map((tc) =>
                tc.id === ev.toolCallId ? { ...tc, args: tc.args + (ev.delta as string) } : tc
              ),
            };

          case "TOOL_CALL_RESULT":
            return {
              ...s,
              toolCalls: s.toolCalls.map((tc) =>
                tc.id === ev.toolCallId
                  ? { ...tc, result: String(ev.content ?? ""), streaming: false }
                  : tc
              ),
            };

          case "STEP_STARTED":
            return {
              ...s,
              steps: [...s.steps, { name: ev.stepName as string, status: "running", startedAt: Date.now() }],
            };

          case "STEP_FINISHED":
            return {
              ...s,
              steps: s.steps.map((step) =>
                step.name === ev.stepName ? { ...step, status: "completed", finishedAt: Date.now() } : step
              ),
            };

          case "ERROR":
            return { ...s, runStatus: "error", error: ev.message as string };

          default:
            return s;
        }
      });
    }

    let retryCount = 0;
    const MAX_RETRIES = 3;

    function connect() {
      if (!activeRef.current) return;

      const es = new EventSource(`/api/stream/${agent}`);
      esRef.current = es;

      es.onopen = () => {
        if (activeRef.current) {
          retryCount = 0;
          setState((s) => ({ ...s, connected: true }));
        }
      };

      es.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data));
        } catch {
          /* ignore parse errors */
        }
      };

      es.onerror = () => {
        if (!activeRef.current) return;
        setState((s) => ({ ...s, connected: false }));
        es.close();
        esRef.current = null;
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          setTimeout(connect, 4000);
        }
      };
    }

    connect();

    return () => {
      activeRef.current = false;
      esRef.current?.close();
      esRef.current = null;
    };
  }, [agent]);

  return { ...state, clearRun };
}
