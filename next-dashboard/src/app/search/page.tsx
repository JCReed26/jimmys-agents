"use client";

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileText, ScrollText, Inbox, Brain } from 'lucide-react';
import Link from 'next/link';
import { AGENTS } from '@/lib/agents';
import { cn } from '@/lib/utils';

interface SearchResult {
  type: 'hotl' | 'hitl' | 'memory' | 'rules';
  agent: string;
  id: number | string;
  excerpt: string;
  created_at?: string;
}

const TYPE_CONFIG = {
  hotl:   { icon: ScrollText, label: 'HOTL log', color: '#f59e0b' },
  hitl:   { icon: Inbox,      label: 'HITL item', color: '#ff4444' },
  memory: { icon: Brain,      label: 'Memory',    color: '#a855f7' },
  rules:  { icon: FileText,   label: 'Rules',     color: '#00d4ff' },
};

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 2) { setResults([]); return; }

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        if (r.ok) {
          const d = await r.json();
          setResults(d.results ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [q]);

  // Group by type
  const groups = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] ?? []).push(r);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Search size={15} className="text-accent-cyan" />
          <h1 className="text-sm font-medium text-primary">Search</h1>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input
            className="input-base pl-8"
            placeholder="Search memories, HOTL logs, HITL items…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-dim text-[10px]">searching…</span>
          )}
        </div>
      </motion.div>

      {q.length < 2 && (
        <div className="text-center text-dim text-[11px] mt-12">
          Type at least 2 characters to search
        </div>
      )}

      {!loading && q.length >= 2 && results.length === 0 && (
        <div className="text-center text-dim text-[11px] mt-12">No results for &ldquo;{q}&rdquo;</div>
      )}

      <AnimatePresence>
        {Object.entries(groups).map(([type, items]) => {
          const tc = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
          const Icon = tc?.icon ?? FileText;
          return (
            <motion.div
              key={type}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6"
            >
              <div className="flex items-center gap-2 mb-3">
                <Icon size={11} style={{ color: tc?.color }} />
                <span className="text-[10px] uppercase tracking-widest text-secondary">{tc?.label}</span>
                <span className="text-[10px] text-dim">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map((item, i) => {
                  const agentConfig = AGENTS[item.agent];
                  const agentColor  = agentConfig?.accentColor ?? '#00d4ff';
                  const href = type === 'hotl' ? '/hotl'
                    : type === 'hitl' ? '/inbox'
                    : `/agent/${item.agent}?tab=memory`;

                  return (
                    <Link
                      key={i}
                      href={href}
                      className="block rounded border border-border p-3 hover:bg-hover transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded"
                          style={{ color: agentColor, background: `${agentColor}18`, border: `1px solid ${agentColor}30` }}
                        >
                          {item.agent}
                        </span>
                        {item.created_at && (
                          <span className="text-[10px] text-dim">{new Date(item.created_at).toLocaleDateString()}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-secondary leading-relaxed">
                        {highlightQ(item.excerpt, q)}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function highlightQ(text: string, q: string): React.ReactNode {
  if (!q || !text) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent-cyan/20 text-accent-cyan rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
