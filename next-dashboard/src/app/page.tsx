"use client";

import { useEffect, useState } from 'react';
import { AgentCard, AgentStatus } from '@/components/agent-card';
import { AGENTS } from '@/lib/agents';
import { Activity, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface AgentStatusData {
  status: string;
  hitlCount?: number;
  nextRun?: string | null;
  lastRun?: string | null;
  totalRuns?: number;
  tokenCount?: string;
}

function mapStatus(raw: string): AgentStatus {
  const s = (raw || '').toUpperCase();
  if (s === 'RUNNING') return 'RUNNING';
  if (s === 'DOWN' || s === 'OFFLINE') return 'DOWN';
  if (s === 'ERROR') return 'ERROR';
  if (s === 'SLEEPING') return 'SLEEPING';
  return 'IDLE';
}

function formatRelative(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  } catch { return undefined; }
}

function formatFuture(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  try {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return 'overdue';
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `in ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `in ${hrs}h`;
    return `in ${Math.floor(hrs / 24)}d`;
  } catch { return undefined; }
}

export default function Home() {
  const [statuses, setStatuses] = useState<Record<string, AgentStatusData>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatuses() {
      try {
        const r = await fetch('/api/agents', { cache: 'no-store' });
        if (r.ok) setStatuses(await r.json());
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    fetchStatuses();
    const iv = setInterval(fetchStatuses, 8000);
    return () => clearInterval(iv);
  }, []);

  const runningCount = Object.values(statuses).filter(s => s.status === 'RUNNING').length;
  const pendingHitl  = Object.values(statuses).reduce((s, a) => s + (a.hitlCount ?? 0), 0);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={14} className="text-accent-cyan" />
            <h1 className="text-sm font-medium text-primary tracking-wide">Agent Fleet</h1>
          </div>
          <p className="text-[11px] text-secondary">
            {loading ? 'connecting…' : `${runningCount} running · ${Object.keys(AGENTS).length} total`}
            {pendingHitl > 0 && (
              <span className="text-accent-red ml-2">· {pendingHitl} HITL pending</span>
            )}
          </p>
        </div>

        {/* Live pulse */}
        <motion.div
          className="flex items-center gap-1.5 text-[10px] text-secondary"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <Activity size={11} className="text-accent-green" />
          <span>live</span>
        </motion.div>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 gap-4">
        {Object.entries(AGENTS).map(([key, config], i) => {
          const data = statuses[key] ?? {};
          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
            >
              <AgentCard
                name={key}
                displayName={config.displayName}
                status={mapStatus(data.status ?? 'IDLE')}
                description={config.description}
                href={`/agent/${key}`}
                icon={config.icon}
                accentColor={config.accentColor}
                accentColorRgb={config.accentColorRgb}
                hitlCount={data.hitlCount ?? 0}
                metrics={{
                  lastRun: formatRelative(data.lastRun),
                  nextRun: formatFuture(data.nextRun),
                  totalRuns: data.totalRuns,
                  tokenCount: data.tokenCount,
                }}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="mt-10 text-center text-[10px] text-muted">
        click an agent to view profile · configure schedules in /schedules
      </div>
    </div>
  );
}
