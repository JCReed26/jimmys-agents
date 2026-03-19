"use client";

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Inbox, Check, X } from 'lucide-react';
import { AGENTS } from '@/lib/agents';
import { cn } from '@/lib/utils';

interface HitlItem {
  id: number;
  agent: string;
  item_type: string;
  payload: string;
  status: string;
  comment?: string;
  created_at: string;
  resolved_at?: string;
}

export default function InboxPage() {
  const [items, setItems] = useState<HitlItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'resolved'>('pending');

  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/hitl', { cache: 'no-store' });
      if (r.ok) setItems(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); const iv = setInterval(reload, 10000); return () => clearInterval(iv); }, [reload]);

  const displayed = items.filter(i => {
    if (filter === 'pending')  return i.status === 'pending';
    if (filter === 'resolved') return i.status !== 'pending';
    return true;
  });

  const pendingCount = items.filter(i => i.status === 'pending').length;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Inbox size={15} className="text-accent-red" />
          <h1 className="text-sm font-medium text-primary">HITL Inbox</h1>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold text-accent-red border border-red-500/30 px-2 py-0.5 rounded bg-red-500/06">
              {pendingCount} pending
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(['all', 'pending', 'resolved'] as const).map(f => (
            <button key={f} className={cn('btn btn-ghost text-[10px]', filter === f && 'text-primary')} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Items */}
      {loading ? (
        <div className="text-dim text-[11px]">loading…</div>
      ) : displayed.length === 0 ? (
        <div className="text-center text-dim text-[11px] mt-16">
          {filter === 'pending' ? '✓ No pending HITL items' : 'No items'}
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <GlobalHitlCard item={item} onReload={reload} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function GlobalHitlCard({ item, onReload }: { item: HitlItem; onReload: () => void }) {
  const isPending = item.status === 'pending';
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const agentConfig = AGENTS[item.agent];
  const accentColor    = agentConfig?.accentColor    ?? '#00d4ff';
  const accentColorRgb = agentConfig?.accentColorRgb ?? '0,212,255';

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
    } finally { setLoading(null); }
  }

  return (
    <div
      className={cn('rounded border p-4 space-y-3', !isPending && 'opacity-65')}
      style={{
        borderColor: isPending ? `rgba(${accentColorRgb}, 0.3)` : 'var(--border)',
        background:  isPending ? `rgba(${accentColorRgb}, 0.03)` : 'transparent',
      }}
    >
      {/* Agent badge + type + time */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded border"
            style={{ color: accentColor, borderColor: `rgba(${accentColorRgb}, 0.4)`, background: `rgba(${accentColorRgb}, 0.08)` }}
          >
            {item.agent}
          </span>
          <span className="text-[10px] text-dim">{item.item_type}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-dim">{new Date(item.created_at).toLocaleString()}</span>
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
      </div>

      {/* Payload */}
      <div className="text-[11px] space-y-1">
        {Object.entries(payloadObj).slice(0, 6).map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <span className="text-dim w-24 shrink-0">{k}</span>
            <span className="text-primary break-all">{String(v).slice(0, 200)}</span>
          </div>
        ))}
      </div>

      {!isPending && item.comment && (
        <div className="text-[10px] text-dim italic border-t border-border pt-2">
          Comment: {item.comment}
        </div>
      )}

      {isPending && (
        <div className="space-y-2 border-t border-border pt-3">
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
