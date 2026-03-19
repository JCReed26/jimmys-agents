"use client";

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CalendarClock, Check, Play } from 'lucide-react';
import { AGENTS } from '@/lib/agents';
import { cn } from '@/lib/utils';

interface Schedule {
  agent: string;
  cron_expr: string;
  enabled: number;
  task_prompt?: string;
  last_run?: string;
  next_run?: string;
}

const CRON_PRESETS = [
  { label: 'every 15 min', value: '*/15 * * * *' },
  { label: 'every 30 min', value: '*/30 * * * *' },
  { label: 'hourly',       value: '0 * * * *'    },
  { label: 'daily 9am',   value: '0 9 * * *'     },
  { label: 'daily 8pm',   value: '0 20 * * *'    },
  { label: 'weekdays 9am',value: '0 9 * * 1-5'   },
];

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Schedule>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');

  const reload = useCallback(async () => {
    try {
      const r = await fetch('/api/schedules', { cache: 'no-store' });
      if (r.ok) setSchedules(await r.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function saveSchedule(agent: string) {
    setSaving(true);
    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, ...editValues }),
      });
      setSaved(agent);
      setTimeout(() => setSaved(''), 2000);
      setEditing(null);
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function triggerNow(agent: string) {
    await fetch(`http://localhost:8080/schedules/${agent}/trigger`, { method: 'POST' });
  }

  const agentNames = Object.keys(AGENTS);
  // Merge: agents that don't have a schedule yet still show up
  const rows = agentNames.map(name => schedules.find(s => s.agent === name) ?? {
    agent: name, cron_expr: '*/30 * * * *', enabled: 1,
  } as Schedule);

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 mb-6">
        <CalendarClock size={15} className="text-accent-cyan" />
        <h1 className="text-sm font-medium text-primary">Schedules</h1>
        <span className="text-[11px] text-secondary ml-2">APScheduler — configures when each agent wakes up</span>
      </motion.div>

      {loading ? (
        <div className="text-dim text-[11px]">loading…</div>
      ) : (
        <div className="space-y-3">
          {rows.map((sched, i) => {
            const agentConfig    = AGENTS[sched.agent];
            const accentColor    = agentConfig?.accentColor    ?? '#00d4ff';
            const accentColorRgb = agentConfig?.accentColorRgb ?? '0,212,255';
            const Icon = agentConfig?.icon;
            const isEditing = editing === sched.agent;

            return (
              <motion.div
                key={sched.agent}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded border overflow-hidden"
                style={{ borderColor: isEditing ? `rgba(${accentColorRgb}, 0.4)` : 'var(--border)' }}
              >
                {/* Row header */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ background: isEditing ? `rgba(${accentColorRgb}, 0.04)` : 'transparent' }}
                >
                  <div className="flex items-center gap-3">
                    {Icon && <Icon size={14} style={{ color: accentColor }} />}
                    <span className="text-[12px] font-medium" style={{ color: accentColor }}>{sched.agent}</span>
                    <code className="text-[11px] text-secondary bg-hover px-2 py-0.5 rounded">{sched.cron_expr}</code>
                    <span className={cn('status-badge', sched.enabled ? 'status-running' : 'status-idle')}>
                      {sched.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {sched.last_run && (
                      <span className="text-[10px] text-dim">last: {new Date(sched.last_run).toLocaleString()}</span>
                    )}
                    <button className="btn btn-ghost text-[10px]" onClick={() => triggerNow(sched.agent)}>
                      <Play size={10} /> run now
                    </button>
                    <button
                      className="btn btn-primary text-[10px]"
                      style={{ color: accentColor, borderColor: `rgba(${accentColorRgb}, 0.35)` }}
                      onClick={() => {
                        if (isEditing) { setEditing(null); } else {
                          setEditing(sched.agent);
                          setEditValues({ cron_expr: sched.cron_expr, enabled: sched.enabled, task_prompt: sched.task_prompt ?? '' });
                        }
                      }}
                    >
                      {isEditing ? 'cancel' : 'edit'}
                    </button>
                  </div>
                </div>

                {/* Edit form */}
                {isEditing && (
                  <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-secondary mb-1.5">Cron expression</label>
                        <input
                          className="input-base"
                          value={editValues.cron_expr ?? ''}
                          onChange={e => setEditValues(p => ({ ...p, cron_expr: e.target.value }))}
                        />
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {CRON_PRESETS.map(p => (
                            <button
                              key={p.value}
                              className="text-[9px] text-dim border border-border px-1.5 py-0.5 rounded hover:text-secondary hover:border-border-accent transition-colors"
                              onClick={() => setEditValues(prev => ({ ...prev, cron_expr: p.value }))}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] text-secondary mb-1.5">Task prompt</label>
                        <textarea
                          className="input-base"
                          rows={3}
                          value={editValues.task_prompt ?? ''}
                          onChange={e => setEditValues(p => ({ ...p, task_prompt: e.target.value }))}
                          placeholder="Instructions for this agent's scheduled run…"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className={cn('btn', editValues.enabled ? 'btn-approve' : 'btn-ghost')}
                        onClick={() => setEditValues(p => ({ ...p, enabled: p.enabled ? 0 : 1 }))}
                      >
                        {editValues.enabled ? '● enabled' : '○ disabled'}
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={saving}
                        style={{ color: saved === sched.agent ? 'var(--green)' : accentColor }}
                        onClick={() => saveSchedule(sched.agent)}
                      >
                        {saved === sched.agent ? <><Check size={11} /> saved</> : saving ? 'saving…' : 'save schedule'}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
