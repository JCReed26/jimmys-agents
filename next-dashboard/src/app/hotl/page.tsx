"use client";

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import { AGENTS } from '@/lib/agents';
import { cn } from '@/lib/utils';

interface HotlLog {
  id: number;
  agent: string;
  run_id: string;
  summary: { tools?: unknown[]; thoughts?: string[]; overview?: string };
  is_read: number;
  created_at: string;
}

export default function HotlPage() {
  const [logs, setLogs] = useState<HotlLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);

  const reload = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (agentFilter) qs.set('agent', agentFilter);
      if (unreadOnly)  qs.set('unread_only', 'true');
      const r = await fetch(`/api/hotl?${qs}`, { cache: 'no-store' });
      if (r.ok) setLogs(await r.json());
    } finally {
      setLoading(false);
    }
  }, [agentFilter, unreadOnly]);

  useEffect(() => { reload(); }, [reload]);

  const unreadCount = logs.filter(l => !l.is_read).length;

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ScrollText size={15} className="text-accent-amber" />
          <h1 className="text-sm font-medium text-primary">HOTL Feed</h1>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold text-accent-amber border border-amber-500/30 px-2 py-0.5 rounded bg-amber-500/06">
              {unreadCount} unread
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input-base text-[10px] w-auto py-1 px-2"
            value={agentFilter}
            onChange={e => setAgentFilter(e.target.value)}
          >
            <option value="">all agents</option>
            {Object.keys(AGENTS).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button
            className={cn('btn text-[10px]', unreadOnly ? 'btn-approve' : 'btn-ghost')}
            onClick={() => setUnreadOnly(p => !p)}
          >
            unread only
          </button>
          <button
            className="btn btn-ghost text-[10px]"
            onClick={async () => {
              const qs = agentFilter ? `?agent=${agentFilter}` : '';
              await fetch(`/api/hotl/read-all${qs}`, { method: 'POST' });
              reload();
            }}
          >
            mark all read
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="text-dim text-[11px]">loading…</div>
      ) : logs.length === 0 ? (
        <div className="text-center text-dim text-[11px] mt-16">No logs yet.</div>
      ) : (
        <div className="space-y-2">
          {logs.map((log, i) => (
            <motion.div key={log.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <HotlCard log={log} onReload={reload} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function HotlCard({ log, onReload }: { log: HotlLog; onReload: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const isUnread = !log.is_read;
  const agentConfig    = AGENTS[log.agent];
  const accentColor    = agentConfig?.accentColor    ?? '#00d4ff';
  const accentColorRgb = agentConfig?.accentColorRgb ?? '0,212,255';

  const tools    = log.summary?.tools    as Record<string,unknown>[] ?? [];
  const thoughts = log.summary?.thoughts as string[] ?? [];
  const overview = log.summary?.overview ?? '';

  async function toggle() {
    if (isUnread) { await fetch(`/api/hotl/${log.id}/read`, { method: 'POST' }); onReload(); }
    setExpanded(p => !p);
  }

  return (
    <div
      className={cn('rounded border overflow-hidden transition-opacity', isUnread ? '' : 'opacity-65')}
      style={{ borderLeft: `2px solid ${isUnread ? accentColor : 'transparent'}`, borderColor: isUnread ? accentColor : 'var(--border)' }}
    >
      <button className="w-full flex items-center justify-between p-3 text-left hover:bg-hover transition-colors" onClick={toggle}>
        <div className="flex items-center gap-3 min-w-0">
          {isUnread && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accentColor }} />}
          {/* Agent badge */}
          <span
            className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
            style={{ color: accentColor, background: `rgba(${accentColorRgb}, 0.1)`, border: `1px solid rgba(${accentColorRgb}, 0.25)` }}
          >
            {log.agent}
          </span>
          <span className={cn('text-[11px] shrink-0', isUnread ? 'text-primary font-medium' : 'text-secondary')}>
            {new Date(log.created_at).toLocaleString()}
          </span>
          {overview && (
            <span className="text-[11px] text-dim truncate">— {overview.slice(0, 80)}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-dim shrink-0 ml-2">
          <span className="text-[10px]">{tools.length} tools · {thoughts.length} thoughts</span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </button>

      {expanded && (
        <div className="p-3 pt-0 border-t border-border space-y-3">
          {overview && <p className="text-[11px] text-secondary">{overview}</p>}

          {thoughts.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-dim mb-2">Thoughts</div>
              {thoughts.map((t, i) => (
                <div key={i} className="thought-bubble mb-1.5 text-[11px]">{t}</div>
              ))}
            </div>
          )}

          {tools.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-dim mb-2">Tool calls ({tools.length})</div>
              {tools.map((t, i) => (
                <div key={i} className="tool-call-card mb-1.5">
                  <span style={{ color: accentColor }} className="text-[10px] font-medium">{String(t.name ?? '?')}</span>
                  {t.params != null && (
                    <pre className="text-[10px] text-dim mt-1 whitespace-pre-wrap break-all">
                      {JSON.stringify(t.params, null, 2).slice(0, 400)}
                    </pre>
                  )}
                  {t.result !== undefined && (
                    <div className="text-[10px] text-primary mt-1 break-all">
                      → {String(t.result).slice(0, 200)}
                    </div>
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
