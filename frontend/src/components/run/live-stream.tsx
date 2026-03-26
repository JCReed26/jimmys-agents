"use client";

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, MessageSquare, CheckSquare, AlertCircle, Terminal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StreamEvent {
  type: 'tool_call' | 'thought' | 'todo' | 'text' | 'done' | 'error';
  payload: Record<string, unknown>;
  seq: number;
  run_id?: string;
}

interface LiveStreamProps {
  agent: string;
  accentColor: string;
  accentColorRgb: string;
}

export function LiveStream({ agent, accentColor, accentColorRgb }: LiveStreamProps) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [todos, setTodos] = useState<{ text: string; done: boolean }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wsUrl = `ws://localhost:8080/ws/${agent}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      try {
        const ev: StreamEvent = JSON.parse(e.data);
        setEvents(prev => [...prev.slice(-200), ev]); // keep last 200

        // Handle todos
        if (ev.type === 'todo') {
          const payload = ev.payload as Record<string, unknown>;
          const list = payload.todos as { text: string; done: boolean }[] | undefined;
          if (list) setTodos(list);
        }
      } catch { /* ignore parse errors */ }
    };

    return () => ws.close();
  }, [agent]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  return (
    <div className="flex gap-4 h-[calc(100vh-300px)] min-h-80">
      {/* Event stream */}
      <div className="flex-1 flex flex-col">
        {/* Connection header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[11px]">
            <Terminal size={12} className="text-secondary" />
            <span className="text-secondary">live stream</span>
          </div>
          <div className={cn('flex items-center gap-1.5 text-[10px]', connected ? 'text-accent-green' : 'text-dim')}>
            <span className={cn('pulse-dot', connected ? 'active' : '')} style={{ color: connected ? 'var(--green)' : 'var(--text-dim)' }} />
            {connected ? 'connected' : 'disconnected'}
          </div>
        </div>

        {/* Stream log */}
        <div
          className="flex-1 overflow-y-auto space-y-2 pr-1"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          {events.length === 0 && (
            <div className="text-center text-dim text-[11px] mt-12">
              {connected ? 'waiting for agent activity…' : 'no active run — trigger one below'}
            </div>
          )}

          <AnimatePresence>
            {events.map((ev, i) => (
              <StreamEventRow key={`${ev.seq}-${i}`} event={ev} accentColor={accentColor} accentColorRgb={accentColorRgb} />
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Todo list sidebar */}
      {todos.length > 0 && (
        <div
          className="w-52 shrink-0 border rounded p-3"
          style={{ borderColor: `rgba(${accentColorRgb}, 0.2)`, background: `rgba(${accentColorRgb}, 0.03)` }}
        >
          <div className="text-[10px] uppercase tracking-widest mb-3" style={{ color: accentColor }}>
            todos
          </div>
          <div className="space-y-2">
            {todos.map((t, i) => (
              <div key={i} className={cn('flex items-start gap-2 text-[11px]', t.done ? 'text-dim line-through' : 'text-secondary')}>
                <CheckSquare size={11} className={t.done ? 'text-accent-green mt-0.5' : 'text-dim mt-0.5'} />
                <span>{t.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StreamEventRow({ event, accentColor, accentColorRgb }: { event: StreamEvent; accentColor: string; accentColorRgb: string }) {
  const p = event.payload;

  if (event.type === 'thought') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className="thought-bubble"
      >
        <div className="flex items-center gap-1.5 mb-1 text-[9px] uppercase tracking-widest text-dim">
          <MessageSquare size={9} />
          <span>thought</span>
        </div>
        <div className="text-secondary text-[11px]">{String(p.content ?? '')}</div>
      </motion.div>
    );
  }

  if (event.type === 'tool_call') {
    const name  = String(p.name ?? 'unknown');
    const params = p.params ?? p.input ?? {};
    const result = p.result;
    return (
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className="tool-call-card"
      >
        <div className="flex items-center gap-1.5 mb-2 text-[9px] uppercase tracking-widest">
          <Cpu size={9} style={{ color: accentColor }} />
          <span style={{ color: accentColor }}>tool: {name}</span>
        </div>
        {Object.keys(params as object).length > 0 && (
          <div className="mb-2">
            <div className="text-[9px] text-dim uppercase mb-1">params</div>
            <pre className="text-[10px] text-secondary whitespace-pre-wrap break-all">
              {JSON.stringify(params, null, 2)}
            </pre>
          </div>
        )}
        {result !== undefined && (
          <div>
            <div className="text-[9px] text-dim uppercase mb-1">result</div>
            <div className="text-[10px] text-primary whitespace-pre-wrap break-all">
              {typeof result === 'string' ? result.slice(0, 500) : JSON.stringify(result, null, 2).slice(0, 500)}
              {(typeof result === 'string' ? result : JSON.stringify(result)).length > 500 ? '…' : ''}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  if (event.type === 'text') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className="text-[11px] text-primary py-1"
      >
        {String(p.content ?? '')}
      </motion.div>
    );
  }

  if (event.type === 'error') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-start gap-2 text-[11px] text-accent-red border border-red-500/20 rounded p-2 bg-red-500/04"
      >
        <AlertCircle size={12} className="mt-0.5 shrink-0" />
        <span>{String(p.message ?? 'Unknown error')}</span>
      </motion.div>
    );
  }

  if (event.type === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-[10px] text-dim py-1 flex items-center gap-2"
      >
        <span className="text-accent-green">✓</span>
        <span>run complete</span>
      </motion.div>
    );
  }

  return null;
}
