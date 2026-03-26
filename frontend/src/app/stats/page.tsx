"use client";

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart2, TrendingUp, Zap, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { AGENTS } from '@/lib/agents';

interface AgentStats {
  total_runs: number;
  errors: number;
  total_tokens: number;
  total_cost: number;
}

interface StatsData {
  by_agent: Record<string, AgentStats>;
  total_runs: number;
}

export default function StatsPage() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/stats', { cache: 'no-store' });
        if (r.ok) setStats(await r.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="text-dim text-[11px] mt-8">loading…</div>;

  const agents = Object.keys(AGENTS);
  const byAgent = stats?.by_agent ?? {};

  const runData = agents.map(a => ({
    name: AGENTS[a].displayName,
    runs: byAgent[a]?.total_runs ?? 0,
    errors: byAgent[a]?.errors ?? 0,
    color: AGENTS[a].accentColor,
  }));

  const tokenData = agents.map(a => ({
    name: AGENTS[a].displayName,
    tokens: byAgent[a]?.total_tokens ?? 0,
    color: AGENTS[a].accentColor,
  }));

  const totalCost = agents.reduce((s, a) => s + (byAgent[a]?.total_cost ?? 0), 0);
  const totalTokens = agents.reduce((s, a) => s + (byAgent[a]?.total_tokens ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
        <BarChart2 size={15} className="text-accent-cyan" />
        <h1 className="text-sm font-medium text-primary">Stats & Costs</h1>
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={<Zap size={14} />} label="Total runs" value={String(stats?.total_runs ?? 0)} color="#00d4ff" />
        <StatCard icon={<TrendingUp size={14} />} label="Total tokens" value={totalTokens > 1000 ? `${(totalTokens/1000).toFixed(1)}k` : String(totalTokens)} color="#a855f7" />
        <StatCard icon={<AlertCircle size={14} />} label="Est. cost" value={`$${totalCost.toFixed(4)}`} color="#f59e0b" />
      </div>

      {/* Per-agent table */}
      <div>
        <h2 className="text-[11px] uppercase tracking-widest text-secondary mb-3">Per-agent breakdown</h2>
        <div className="rounded border border-border overflow-hidden">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="text-left px-4 py-2 text-dim font-normal">agent</th>
                <th className="text-right px-4 py-2 text-dim font-normal">runs</th>
                <th className="text-right px-4 py-2 text-dim font-normal">errors</th>
                <th className="text-right px-4 py-2 text-dim font-normal">success %</th>
                <th className="text-right px-4 py-2 text-dim font-normal">tokens</th>
                <th className="text-right px-4 py-2 text-dim font-normal">cost</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(name => {
                const s = byAgent[name] ?? { total_runs: 0, errors: 0, total_tokens: 0, total_cost: 0 };
                const successRate = s.total_runs > 0 ? Math.round((1 - s.errors / s.total_runs) * 100) : 100;
                const config = AGENTS[name];
                return (
                  <tr key={name} className="border-b border-border last:border-0 hover:bg-hover transition-colors">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full" style={{ background: config.accentColor }} />
                        {config.displayName}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-primary">{s.total_runs}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: s.errors > 0 ? 'var(--red)' : 'var(--text-dim)' }}>{s.errors}</td>
                    <td className="px-4 py-2.5 text-right" style={{ color: successRate >= 90 ? 'var(--green)' : successRate >= 70 ? 'var(--yellow)' : 'var(--red)' }}>
                      {successRate}%
                    </td>
                    <td className="px-4 py-2.5 text-right text-secondary">
                      {s.total_tokens > 1000 ? `${(s.total_tokens/1000).toFixed(1)}k` : s.total_tokens}
                    </td>
                    <td className="px-4 py-2.5 text-right text-secondary">${s.total_cost.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-[11px] uppercase tracking-widest text-secondary mb-3">Runs per agent</h2>
          <div className="rounded border border-border p-4 bg-surface h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={runData} barSize={20}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={25} />
                <Tooltip />
                <Bar dataKey="runs" radius={[2,2,0,0]}>
                  {runData.map((entry, i) => (
                    <rect key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <h2 className="text-[11px] uppercase tracking-widest text-secondary mb-3">Tokens per agent</h2>
          <div className="rounded border border-border p-4 bg-surface h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tokenData} barSize={20}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} width={35} />
                <Tooltip />
                <Bar dataKey="tokens" radius={[2,2,0,0]} fill="#a855f7" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded border border-border p-4 bg-card space-y-2"
    >
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <span className="text-[11px] text-secondary">{label}</span>
      </div>
      <div className="text-2xl font-medium text-primary">{value}</div>
    </motion.div>
  );
}
