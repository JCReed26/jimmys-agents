"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Play, Lock, Check, X, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AGENTS } from '@/lib/agents';
import { LiveStream } from '@/components/run/live-stream';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────
interface HitlItem {
  id: number;
  agent: string;
  item_type: string;
  payload: string;
  status: string;
  comment?: string;
  created_at: string;
}

interface HotlLog {
  id: number;
  agent: string;
  run_id: string;
  summary: { tools?: unknown[]; thoughts?: string[]; overview?: string };
  is_read: number;
  created_at: string;
}

interface Schedule {
  agent: string;
  cron_expr: string;
  enabled: number;
  task_prompt?: string;
  last_run?: string;
  next_run?: string;
}

type Tab = 'run' | 'config' | 'memory' | 'loop';

// ─────────────────────────────────────────
// Main page
// ─────────────────────────────────────────
export default function AgentPage() {
  const { name } = useParams<{ name: string }>();
  const config = AGENTS[name];
  const [tab, setTab] = useState<Tab>('run');

  if (!config) {
    return <div className="text-secondary text-sm mt-8">Agent &quot;{name}&quot; not found.</div>;
  }

  const { accentColor, accentColorRgb } = config;
  const Icon = config.icon;

  return (
    <div
      className="max-w-4xl mx-auto"
      style={{ ['--agent-color' as string]: accentColor, ['--agent-color-rgb' as string]: accentColorRgb }}
    >
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3 mb-6">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: `rgba(${accentColorRgb}, 0.1)`, border: `1px solid rgba(${accentColorRgb}, 0.25)` }}
        >
          <Icon size={18} style={{ color: accentColor }} />
        </div>
        <div>
          <h1 className="text-sm font-medium text-primary">{config.displayName}</h1>
          <p className="text-[11px] text-secondary">{config.description}</p>
        </div>
        <div className="ml-auto">
          <TriggerButton agent={name} accentColor={accentColor} accentColorRgb={accentColorRgb} />
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="tab-list">
        {([
          { id: 'run',    label: 'live run'        },
          { id: 'config', label: 'config'           },
          { id: 'memory', label: 'memory & rules'   },
          { id: 'loop',   label: 'hitl / hotl'      },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} className={cn('tab-trigger', tab === t.id && 'active')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'run'    && <RunTab    agent={name} accentColor={accentColor} accentColorRgb={accentColorRgb} />}
      {tab === 'config' && <ConfigTab agent={name} accentColor={accentColor} />}
      {tab === 'memory' && <MemoryTab agent={name} accentColor={accentColor} />}
      {tab === 'loop'   && <LoopTab   agent={name} accentColor={accentColor} accentColorRgb={accentColorRgb} />}
    </div>
  );
}

// ─────────────────────────────────────────
// Trigger button
// ─────────────────────────────────────────
function TriggerButton({ agent, accentColor, accentColorRgb }: { agent: string; accentColor: string; accentColorRgb: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function trigger() {
    setLoading(true);
    try {
      await fetch(`http://localhost:8080/schedules/${agent}/trigger`, { method: 'POST' });
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={trigger}
      disabled={loading}
      className="btn btn-primary flex items-center gap-2"
      style={{ borderColor: `rgba(${accentColorRgb}, 0.4)`, color: done ? 'var(--green)' : accentColor }}
    >
      {done ? <Check size={12} /> : loading ? <span className="text-dim">…</span> : <Play size={12} />}
      {done ? 'triggered' : loading ? 'triggering' : 'trigger run'}
    </button>
  );
}

// ─────────────────────────────────────────
// Run tab — live streaming view
// ─────────────────────────────────────────
function RunTab({ agent, accentColor, accentColorRgb }: { agent: string; accentColor: string; accentColorRgb: string }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <LiveStream agent={agent} accentColor={accentColor} accentColorRgb={accentColorRgb} />
    </motion.div>
  );
}

// ─────────────────────────────────────────
// Config tab
// ─────────────────────────────────────────
function ConfigTab({ agent, accentColor }: { agent: string; accentColor: string }) {
  const [sched, setSched] = useState<Schedule | null>(null);
  const [cronExpr, setCronExpr] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [taskPrompt, setTaskPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/schedules', { cache: 'no-store' });
        if (r.ok) {
          const list: Schedule[] = await r.json();
          const found = list.find(s => s.agent === agent);
          if (found) {
            setSched(found);
            setCronExpr(found.cron_expr);
            setEnabled(!!found.enabled);
            setTaskPrompt(found.task_prompt ?? '');
          }
        }
      } catch { /* ignore */ }
    }
    load();
  }, [agent]);

  async function save() {
    setSaving(true);
    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, cron_expr: cronExpr, enabled, task_prompt: taskPrompt }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-lg">
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={13} style={{ color: accentColor }} />
          <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: accentColor }}>Schedule</span>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] text-secondary mb-1.5">Cron expression</label>
            <input
              className="input-base"
              value={cronExpr}
              onChange={e => setCronExpr(e.target.value)}
              placeholder="*/30 * * * *  (every 30 min)"
            />
            <div className="text-[10px] text-dim mt-1">min hour day month weekday</div>
          </div>
          <div>
            <label className="block text-[11px] text-secondary mb-1.5">Task prompt</label>
            <textarea
              className="input-base"
              rows={4}
              value={taskPrompt}
              onChange={e => setTaskPrompt(e.target.value)}
              placeholder="What should the agent do when it wakes up?"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              className={cn('btn', enabled ? 'btn-approve' : 'btn-ghost')}
              onClick={() => setEnabled(p => !p)}
            >
              {enabled ? '● enabled' : '○ disabled'}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="btn btn-primary"
              style={{ color: saved ? 'var(--green)' : accentColor, borderColor: `color-mix(in srgb, ${accentColor} 35%, var(--border))` }}
            >
              {saved ? '✓ saved' : saving ? 'saving…' : 'save'}
            </button>
          </div>
        </div>
        {sched?.last_run && (
          <div className="mt-5 text-[11px] space-y-1 text-dim">
            <div>last run: <span className="text-secondary">{new Date(sched.last_run).toLocaleString()}</span></div>
            {sched.next_run && <div>next run: <span className="text-secondary">{new Date(sched.next_run).toLocaleString()}</span></div>}
          </div>
        )}
      </section>
    </motion.div>
  );
}

// ─────────────────────────────────────────
// Memory & Rules tab
// ─────────────────────────────────────────
function MemoryTab({ agent, accentColor }: { agent: string; accentColor: string }) {
  const [memory, setMemory] = useState('');
  const [rules,  setRules]  = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`/api/memory/${agent}`, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          setMemory(d.memory ?? '');
          setRules(d.rules ?? '');
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agent]);

  if (loading) return <div className="text-dim text-[11px] mt-8">loading…</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-4">
      <FileViewer title="MEMORY.md" content={memory} accentColor={accentColor} note="agent-managed" />
      <FileViewer title="RULES.md"  content={rules}  accentColor={accentColor} note="agent-managed" />
    </motion.div>
  );
}

function FileViewer({ title, content, accentColor, note }: { title: string; content: string; accentColor: string; note: string }) {
  return (
    <div className="rounded border overflow-hidden" style={{ borderColor: `color-mix(in srgb, ${accentColor} 20%, var(--border))` }}>
      <div
        className="px-3 py-2 flex items-center justify-between border-b"
        style={{ borderColor: `color-mix(in srgb, ${accentColor} 15%, var(--border))`, background: `rgba(var(--agent-color-rgb,0,212,255),0.03)` }}
      >
        <span className="text-[11px] font-medium" style={{ color: accentColor }}>{title}</span>
        <span className="flex items-center gap-1 text-[9px] text-dim">
          <Lock size={8} /> {note}
        </span>
      </div>
      <div className="p-4 max-h-[500px] overflow-y-auto prose-dark text-[11px]">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// HITL / HOTL tab
// ─────────────────────────────────────────
function LoopTab({ agent, accentColor, accentColorRgb }: { agent: string; accentColor: string; accentColorRgb: string }) {
  const [hitlItems, setHitlItems] = useState<HitlItem[]>([]);
  const [hotlLogs,  setHotlLogs]  = useState<HotlLog[]>([]);
  const [subTab, setSubTab] = useState<'hitl' | 'hotl'>('hitl');

  const reload = useCallback(async () => {
    try {
      const [hr, holr] = await Promise.all([
        fetch(`/api/hitl?agent=${agent}`, { cache: 'no-store' }),
        fetch(`/api/hotl?agent=${agent}`, { cache: 'no-store' }),
      ]);
      if (hr.ok)   setHitlItems(await hr.json());
      if (holr.ok) setHotlLogs(await holr.json());
    } catch { /* ignore */ }
  }, [agent]);

  useEffect(() => { reload(); }, [reload]);

  const pendingCount = hitlItems.filter(i => i.status === 'pending').length;
  const unreadCount  = hotlLogs.filter(l => !l.is_read).length;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex gap-0 mb-4 border-b border-border">
        <button className={cn('tab-trigger', subTab === 'hitl' && 'active')} onClick={() => setSubTab('hitl')}>
          HITL inbox {pendingCount > 0 && <span className="ml-1 text-[9px]" style={{ color: accentColor }}>({pendingCount})</span>}
        </button>
        <button className={cn('tab-trigger', subTab === 'hotl' && 'active')} onClick={() => setSubTab('hotl')}>
          HOTL log {unreadCount > 0 && <span className="ml-1 text-[9px]" style={{ color: accentColor }}>({unreadCount} unread)</span>}
        </button>
      </div>
      {subTab === 'hitl' && <HitlList items={hitlItems} accentColor={accentColor} accentColorRgb={accentColorRgb} onReload={reload} />}
      {subTab === 'hotl' && <HotlList logs={hotlLogs} accentColor={accentColor} onReload={reload} />}
    </motion.div>
  );
}

// ─────────────────────────────────────────
// Reusable HITL list (also used on /inbox)
// ─────────────────────────────────────────
export function HitlList({ items, accentColor, accentColorRgb, onReload }: {
  items: HitlItem[]; accentColor: string; accentColorRgb: string; onReload: () => void;
}) {
  const pending  = items.filter(i => i.status === 'pending');
  const resolved = items.filter(i => i.status !== 'pending');

  if (items.length === 0) return <div className="text-dim text-[11px] mt-6">No HITL items.</div>;

  return (
    <div className="space-y-3">
      {pending.map(item => (
        <HitlItemCard key={item.id} item={item} accentColor={accentColor} accentColorRgb={accentColorRgb} onReload={onReload} />
      ))}
      {resolved.length > 0 && (
        <>
          <div className="text-[10px] text-dim uppercase tracking-widest mt-6 mb-2">Resolved</div>
          {resolved.map(item => (
            <HitlItemCard key={item.id} item={item} accentColor={accentColor} accentColorRgb={accentColorRgb} onReload={onReload} />
          ))}
        </>
      )}
    </div>
  );
}

function HitlItemCard({ item, accentColor, accentColorRgb, onReload }: {
  item: HitlItem; accentColor: string; accentColorRgb: string; onReload: () => void;
}) {
  const isPending = item.status === 'pending';
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);

  let payloadObj: Record<string, unknown> = {};
  try { payloadObj = JSON.parse(item.payload); } catch { /* ignore */ }

  async function resolve(decision: 'approved' | 'rejected') {
    setLoading(decision === 'approved' ? 'approve' : 'reject');
    try {
      await fetch(`/api/hitl/${item.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment }),
      });
      onReload();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div
      className={cn('rounded border p-3 space-y-2', !isPending && 'opacity-60')}
      style={{
        borderColor: isPending ? `rgba(${accentColorRgb}, 0.35)` : 'var(--border)',
        background:  isPending ? `rgba(${accentColorRgb}, 0.04)` : 'transparent',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-dim">
          <span>{item.item_type}</span>
          <span>·</span>
          <span>{new Date(item.created_at).toLocaleString()}</span>
        </div>
        <span
          className="status-badge"
          style={isPending
            ? { color: accentColor, borderColor: `rgba(${accentColorRgb}, 0.5)` }
            : { color: item.status === 'approved' ? 'var(--green)' : 'var(--red)', borderColor: item.status === 'approved' ? 'var(--green)' : 'var(--red)' }
          }
        >
          {item.status}
        </span>
      </div>

      <div className="text-[11px] text-secondary space-y-0.5">
        {Object.entries(payloadObj).slice(0, 5).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="text-dim shrink-0">{k}:</span>
            <span className="text-primary break-all">{String(v).slice(0, 140)}</span>
          </div>
        ))}
      </div>

      {!isPending && item.comment && (
        <div className="text-[10px] text-dim italic">comment: {item.comment}</div>
      )}

      {isPending && (
        <div className="space-y-2 pt-1">
          <textarea
            className="input-base text-[11px]"
            rows={2}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Optional comment to the agent…"
          />
          <div className="flex gap-2">
            <button className="btn btn-approve" disabled={!!loading} onClick={() => resolve('approved')}>
              {loading === 'approve' ? '…' : <><Check size={11} /> approve</>}
            </button>
            <button className="btn btn-reject" disabled={!!loading} onClick={() => resolve('rejected')}>
              {loading === 'reject' ? '…' : <><X size={11} /> reject</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// Reusable HOTL list (also used on /hotl)
// ─────────────────────────────────────────
export function HotlList({ logs, accentColor, onReload }: {
  logs: HotlLog[]; accentColor: string; onReload: () => void;
}) {
  if (logs.length === 0) return <div className="text-dim text-[11px] mt-6">No HOTL logs yet.</div>;

  return (
    <div className="space-y-2">
      <div className="flex justify-end mb-2">
        <button
          className="btn btn-ghost text-[10px]"
          onClick={async () => { await fetch('/api/hotl/read-all', { method: 'POST' }); onReload(); }}
        >
          mark all read
        </button>
      </div>
      {logs.map(log => <HotlLogCard key={log.id} log={log} accentColor={accentColor} onReload={onReload} />)}
    </div>
  );
}

function HotlLogCard({ log, accentColor, onReload }: { log: HotlLog; accentColor: string; onReload: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isUnread = !log.is_read;

  async function toggle() {
    if (isUnread) { await fetch(`/api/hotl/${log.id}/read`, { method: 'POST' }); onReload(); }
    setExpanded(p => !p);
  }

  const tools    = log.summary?.tools    as Record<string,unknown>[] ?? [];
  const thoughts = log.summary?.thoughts as string[] ?? [];
  const overview = log.summary?.overview ?? '';

  return (
    <div
      className={cn('rounded border overflow-hidden', isUnread ? 'hotl-unread' : 'hotl-read')}
      style={{ borderColor: isUnread ? accentColor : 'var(--border)' }}
    >
      <button className="w-full flex items-center justify-between p-3 text-left hover:bg-hover transition-colors" onClick={toggle}>
        <div className="flex items-center gap-3">
          {isUnread && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />}
          <span className={cn('text-[11px]', isUnread ? 'text-primary font-medium' : 'text-secondary')}>
            {new Date(log.created_at).toLocaleString()}
          </span>
          {overview && <span className="text-[11px] text-dim truncate max-w-xs">— {overview.slice(0, 80)}</span>}
        </div>
        <div className="flex items-center gap-2 text-dim shrink-0">
          <span className="text-[10px]">{tools.length} tools</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </button>
      {expanded && (
        <div className="p-3 pt-0 space-y-3 border-t border-border">
          {overview && <p className="text-[11px] text-secondary">{overview}</p>}
          {thoughts.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-dim mb-2">Thoughts</div>
              {thoughts.map((t, i) => <div key={i} className="thought-bubble mb-1">{t}</div>)}
            </div>
          )}
          {tools.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-dim mb-2">Tool calls</div>
              {tools.map((t, i) => (
                <div key={i} className="tool-call-card mb-1">
                  <span style={{ color: accentColor }} className="text-[10px] font-medium">{String(t.name ?? '?')}</span>
                  {t.params != null && (
                    <pre className="text-[10px] text-dim mt-1 whitespace-pre-wrap break-all">
                      {JSON.stringify(t.params, null, 2).slice(0, 300)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
