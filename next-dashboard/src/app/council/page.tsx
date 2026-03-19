"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Check, Archive, Send, FileText } from 'lucide-react';
import { AGENTS } from '@/lib/agents';
import { cn } from '@/lib/utils';

interface Contract {
  id: number;
  title: string;
  parties: string[];
  terms_md: string;
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

interface Message {
  id: number;
  sender: string;
  content: string;
  created_at: string;
}

const AGENT_LIST = Object.entries(AGENTS);

// Round table positions for 4 agents (in degrees)
const SEAT_ANGLES = [270, 0, 90, 180]; // top, right, bottom, left

export default function CouncilPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [showNewContract, setShowNewContract] = useState(false);
  const [activeContract, setActiveContract] = useState<Contract | null>(null);
  const [msg, setMsg] = useState('');
  const msgEnd = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const [cr, mr] = await Promise.all([
        fetch('/api/council?resource=contracts', { cache: 'no-store' }),
        fetch('/api/council?resource=messages',  { cache: 'no-store' }),
      ]);
      if (cr.ok) setContracts(await cr.json());
      if (mr.ok) setMessages(await mr.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { reload(); const iv = setInterval(reload, 8000); return () => clearInterval(iv); }, [reload]);

  useEffect(() => { msgEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMsg() {
    if (!msg.trim()) return;
    await fetch('/api/council?resource=messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: 'user', content: msg.trim() }),
    });
    setMsg('');
    reload();
  }

  async function activateContract(id: number) {
    await fetch(`/api/council?resource=contracts&id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
    reload();
  }

  async function archiveContract(id: number) {
    await fetch(`/api/council?resource=contracts&id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    });
    reload();
  }

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-100px)] flex flex-col gap-0">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 mb-4">
        <Users size={15} className="text-accent-violet" />
        <h1 className="text-sm font-medium text-primary">Agent Council</h1>
        <span className="text-[11px] text-secondary ml-2">A2A coordination — contracts & agreements between agents</span>
      </motion.div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left: Round table + chat */}
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          {/* Round table */}
          <div className="relative flex items-center justify-center" style={{ height: 280 }}>
            {/* Table surface */}
            <div
              className="council-table-ring absolute"
              style={{ width: 200, height: 200, top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
            />

            {/* Table label */}
            <div className="absolute text-center z-10 pointer-events-none">
              <div className="text-[9px] uppercase tracking-widest text-dim">council</div>
              <div className="text-[11px] text-secondary mt-0.5">{contracts.filter(c => c.status === 'active').length} active contracts</div>
            </div>

            {/* Agent seats */}
            {AGENT_LIST.map(([key, cfg], i) => {
              const angleDeg = SEAT_ANGLES[i] ?? (i * 90);
              const angleRad = (angleDeg * Math.PI) / 180;
              const radius   = 115;
              const cx = Math.cos(angleRad) * radius;
              const cy = Math.sin(angleRad) * radius;
              const Icon = cfg.icon;

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className="absolute flex flex-col items-center gap-1 cursor-pointer group"
                  style={{ left: `calc(50% + ${cx}px)`, top: `calc(50% + ${cy}px)`, transform: 'translate(-50%, -50%)' }}
                >
                  {/* Seat circle */}
                  <motion.div
                    whileHover={{ scale: 1.15 }}
                    className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
                    style={{
                      background: `rgba(${cfg.accentColorRgb}, 0.12)`,
                      border: `2px solid ${cfg.accentColor}`,
                      boxShadow: `0 0 12px rgba(${cfg.accentColorRgb}, 0.3)`,
                    }}
                  >
                    <Icon size={18} style={{ color: cfg.accentColor }} />
                  </motion.div>
                  <span className="text-[9px] text-secondary group-hover:text-primary transition-colors">{cfg.displayName}</span>
                </motion.div>
              );
            })}

            {/* Connecting lines from each agent to center (active contracts glow) */}
            <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
              {contracts.filter(c => c.status === 'active').map((contract, i) => {
                const party1 = AGENT_LIST.findIndex(([k]) => contract.parties.includes(k));
                const party2 = AGENT_LIST.findIndex(([k, _]) => contract.parties.includes(k) && AGENT_LIST.indexOf(AGENT_LIST[party1]) !== AGENT_LIST.findIndex(([k2]) => k2 === k));
                if (party1 < 0 || party2 < 0) return null;
                const a1 = (SEAT_ANGLES[party1] * Math.PI) / 180;
                const a2 = (SEAT_ANGLES[party2] * Math.PI) / 180;
                const cx1 = 50 + Math.cos(a1) * 38; // % of container
                const cy1 = 50 + Math.sin(a1) * 38;
                const cx2 = 50 + Math.cos(a2) * 38;
                const cy2 = 50 + Math.sin(a2) * 38;
                const c1 = AGENTS[contract.parties[0]];
                return (
                  <line
                    key={i}
                    x1={`${cx1}%`} y1={`${cy1}%`}
                    x2={`${cx2}%`} y2={`${cy2}%`}
                    stroke={c1?.accentColor ?? '#00d4ff'}
                    strokeWidth="1"
                    strokeOpacity="0.4"
                    strokeDasharray="3 3"
                  />
                );
              })}
            </svg>
          </div>

          {/* Council chat */}
          <div className="flex-1 min-h-0 flex flex-col border border-border rounded overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-surface flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-secondary">council broadcast</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.map(m => {
                const agentCfg = AGENTS[m.sender];
                const color = agentCfg?.accentColor ?? (m.sender === 'user' ? '#00d4ff' : '#888');
                return (
                  <div key={m.id} className={cn('flex items-start gap-2', m.sender === 'user' && 'flex-row-reverse')}>
                    <div
                      className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[8px] font-bold"
                      style={{ background: `rgba(${agentCfg?.accentColorRgb ?? '0,212,255'}, 0.15)`, color }}
                    >
                      {m.sender.slice(0, 1).toUpperCase()}
                    </div>
                    <div
                      className="text-[11px] rounded px-2.5 py-1.5 max-w-xs"
                      style={{
                        background: `rgba(${agentCfg?.accentColorRgb ?? '0,212,255'}, 0.07)`,
                        border: `1px solid rgba(${agentCfg?.accentColorRgb ?? '0,212,255'}, 0.2)`,
                        color: 'var(--text-primary)',
                      }}
                    >
                      <div className="text-[9px] mb-1" style={{ color }}>{m.sender}</div>
                      {m.content}
                    </div>
                  </div>
                );
              })}
              <div ref={msgEnd} />
              {messages.length === 0 && (
                <div className="text-center text-dim text-[10px] mt-4">No messages yet. Start the council…</div>
              )}
            </div>
            <div className="border-t border-border p-2 flex gap-2">
              <input
                className="input-base flex-1 py-1 text-[11px]"
                placeholder="Broadcast to all agents…"
                value={msg}
                onChange={e => setMsg(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMsg()}
              />
              <button className="btn btn-primary" onClick={sendMsg}>
                <Send size={11} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Contracts panel */}
        <div className="w-80 shrink-0 flex flex-col border border-border rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-border bg-surface flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText size={11} className="text-accent-violet" />
              <span className="text-[10px] uppercase tracking-widest text-secondary">contracts</span>
            </div>
            <button
              className="btn btn-ghost text-[10px] p-1"
              onClick={() => setShowNewContract(true)}
              title="New contract"
            >
              <Plus size={12} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {contracts.length === 0 && (
              <div className="text-center text-dim text-[10px] mt-6">No contracts yet.<br />Create one to define agent agreements.</div>
            )}
            {contracts.map(c => (
              <ContractCard
                key={c.id}
                contract={c}
                isActive={activeContract?.id === c.id}
                onClick={() => setActiveContract(activeContract?.id === c.id ? null : c)}
                onActivate={() => activateContract(c.id)}
                onArchive={() => archiveContract(c.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* New contract modal */}
      <AnimatePresence>
        {showNewContract && (
          <NewContractModal onClose={() => setShowNewContract(false)} onCreated={reload} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────
// Contract card
// ─────────────────────────────────────────
function ContractCard({ contract, isActive, onClick, onActivate, onArchive }: {
  contract: Contract; isActive: boolean; onClick: () => void;
  onActivate: () => void; onArchive: () => void;
}) {
  const statusColor = { draft: '#888', active: '#00ff88', archived: '#444' }[contract.status] ?? '#888';

  return (
    <div
      className={cn('rounded border overflow-hidden cursor-pointer transition-all', isActive && 'ring-1')}
      style={{
        borderColor: isActive ? statusColor : 'var(--border)',
        ['--tw-ring-color' as string]: statusColor,
      }}
    >
      <div className="p-2.5" onClick={onClick}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="text-[11px] font-medium text-primary leading-tight">{contract.title}</span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded border shrink-0"
            style={{ color: statusColor, borderColor: statusColor }}
          >
            {contract.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-1 mb-1">
          {contract.parties.map(p => {
            const cfg = AGENTS[p];
            return (
              <span
                key={p}
                className="text-[9px] px-1 rounded"
                style={{ color: cfg?.accentColor ?? '#888', background: `${cfg?.accentColor ?? '#888'}15` }}
              >
                {cfg?.displayName ?? p}
              </span>
            );
          })}
        </div>
        <div className="text-[10px] text-dim">{new Date(contract.created_at).toLocaleDateString()}</div>
      </div>

      {isActive && (
        <div className="border-t border-border p-2.5 space-y-2">
          <pre className="text-[10px] text-secondary whitespace-pre-wrap font-mono leading-relaxed">
            {contract.terms_md.slice(0, 400)}{contract.terms_md.length > 400 ? '\n…' : ''}
          </pre>
          {contract.status !== 'archived' && (
            <div className="flex gap-2">
              {contract.status === 'draft' && (
                <button className="btn btn-approve text-[10px]" onClick={onActivate}>
                  <Check size={10} /> activate
                </button>
              )}
              <button className="btn btn-ghost text-[10px]" onClick={onArchive}>
                <Archive size={10} /> archive
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// New contract modal
// ─────────────────────────────────────────
function NewContractModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title,    setTitle]   = useState('');
  const [parties,  setParties] = useState<string[]>([]);
  const [terms,    setTerms]   = useState('');
  const [saving,   setSaving]  = useState(false);

  const toggleParty = (agent: string) => {
    setParties(p => p.includes(agent) ? p.filter(a => a !== agent) : [...p, agent]);
  };

  async function create() {
    if (!title || parties.length < 1) return;
    setSaving(true);
    try {
      await fetch('/api/council?resource=contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, parties, terms_md: terms }),
      });
      onCreated();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-overlay z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="bg-card border border-border rounded-lg p-6 w-full max-w-lg space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-accent-violet" />
            <span className="text-sm font-medium text-primary">New Contract</span>
          </div>
          <button className="btn btn-ghost text-[10px]" onClick={onClose}>✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-secondary mb-1.5">Title</label>
            <input className="input-base" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Gmail → Job Chain referral agreement" />
          </div>

          <div>
            <label className="block text-[11px] text-secondary mb-1.5">Parties (agents involved)</label>
            <div className="flex flex-wrap gap-2">
              {AGENT_LIST.map(([key, cfg]) => (
                <button
                  key={key}
                  className={cn('btn text-[10px]', parties.includes(key) ? 'btn-approve' : 'btn-ghost')}
                  style={parties.includes(key) ? { color: cfg.accentColor, borderColor: cfg.accentColor } : {}}
                  onClick={() => toggleParty(key)}
                >
                  {cfg.displayName}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-secondary mb-1.5">Terms (markdown)</label>
            <textarea
              className="input-base font-mono"
              rows={6}
              value={terms}
              onChange={e => setTerms(e.target.value)}
              placeholder="## Agreement&#10;&#10;When Gmail-agent detects a job posting email, it SHALL:&#10;1. Extract the job URL&#10;2. Forward to job-app-chain via HITL request&#10;&#10;job-app-chain SHALL process within 24h."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onClose}>cancel</button>
          <button
            className="btn btn-primary"
            style={{ color: 'var(--violet)', borderColor: 'rgba(168,85,247,0.4)' }}
            disabled={!title || parties.length < 1 || saving}
            onClick={create}
          >
            {saving ? 'creating…' : 'create contract'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
