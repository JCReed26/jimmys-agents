"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, AlertTriangle, Server, Info } from 'lucide-react';
import { AGENTS } from '@/lib/agents';

export default function SettingsPage() {
  const [cleared, setCleared] = useState(false);

  async function clearAllLogs() {
    // Future: call API to clear logs
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2">
        <Settings size={15} className="text-secondary" />
        <h1 className="text-sm font-medium text-primary">Settings</h1>
      </motion.div>

      {/* System info */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Server size={12} className="text-accent-cyan" />
          <h2 className="text-[11px] uppercase tracking-widest text-secondary">System</h2>
        </div>
        <div className="rounded border border-border overflow-hidden">
          <div className="divide-y divide-border">
            <InfoRow label="API Server" value="http://localhost:8080" />
            <InfoRow label="Dashboard" value="http://localhost:3000" />
            <InfoRow label="State DB"  value="data/state.db (SQLite)" />
            {Object.entries(AGENTS).map(([name, cfg]) => (
              <InfoRow key={name} label={cfg.displayName} value={`${cfg.url} · port ${cfg.port}`} color={cfg.accentColor} />
            ))}
          </div>
        </div>
      </section>

      {/* Polling */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Info size={12} className="text-accent-violet" />
          <h2 className="text-[11px] uppercase tracking-widest text-secondary">Dashboard polling</h2>
        </div>
        <div className="rounded border border-border p-4 space-y-2 text-[11px] text-secondary">
          <div className="flex justify-between">
            <span className="text-dim">Agent status refresh</span>
            <span>8 seconds</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">HITL/HOTL counts</span>
            <span>15 seconds</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">HITL inbox refresh</span>
            <span>10 seconds</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dim">Live run stream</span>
            <span>WebSocket (real-time)</span>
          </div>
        </div>
      </section>

      {/* Danger zone */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={12} className="text-accent-red" />
          <h2 className="text-[11px] uppercase tracking-widest text-accent-red">Danger zone</h2>
        </div>
        <div className="rounded border border-red-500/20 p-4 space-y-3 bg-red-500/03">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] text-primary">Clear all HOTL logs</div>
              <div className="text-[10px] text-dim mt-0.5">Permanently deletes all post-hoc review logs</div>
            </div>
            <button
              className="btn btn-reject text-[10px]"
              onClick={clearAllLogs}
            >
              {cleared ? '✓ cleared' : 'clear logs'}
            </button>
          </div>
        </div>
      </section>

      {/* Instructions */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Info size={12} className="text-secondary" />
          <h2 className="text-[11px] uppercase tracking-widest text-secondary">Getting started</h2>
        </div>
        <div className="rounded border border-border p-4 text-[11px] text-secondary space-y-2">
          <p><span className="text-dim">1.</span> Start the API server: <code className="text-primary bg-hover px-1.5 py-0.5 rounded text-[10px]">make run-api-server</code></p>
          <p><span className="text-dim">2.</span> Start agents: <code className="text-primary bg-hover px-1.5 py-0.5 rounded text-[10px]">make start-all</code></p>
          <p><span className="text-dim">3.</span> Configure agent schedules in <a href="/schedules" className="text-accent-cyan hover:underline">/schedules</a></p>
          <p><span className="text-dim">4.</span> View agent profiles and trigger runs from <a href="/" className="text-accent-cyan hover:underline">/fleet</a></p>
          <p><span className="text-dim">5.</span> Review HITL approvals at <a href="/inbox" className="text-accent-cyan hover:underline">/inbox</a></p>
        </div>
      </section>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-[11px]">
      <span className="text-secondary">{label}</span>
      <span className="text-dim font-mono" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}
