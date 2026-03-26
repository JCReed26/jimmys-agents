"use client";

import { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type AgentStatus = 'RUNNING' | 'IDLE' | 'SLEEPING' | 'DOWN' | 'ERROR';

interface AgentCardProps {
  name: string;
  displayName?: string;
  status: AgentStatus;
  description: string;
  href: string;
  icon: LucideIcon;
  accentColor: string;
  accentColorRgb: string;
  hitlCount?: number;
  metrics?: {
    lastRun?: string;
    nextRun?: string;
    totalRuns?: number;
    successRate?: string;
    tokenCount?: string;
  };
}

const statusConfig: Record<AgentStatus, { label: string; dotClass: string; badgeClass: string }> = {
  RUNNING:  { label: 'running',  dotClass: 'active',   badgeClass: 'status-running'  },
  IDLE:     { label: 'idle',     dotClass: '',          badgeClass: 'status-idle'     },
  SLEEPING: { label: 'sleeping', dotClass: 'sleeping',  badgeClass: 'status-sleeping' },
  DOWN:     { label: 'offline',  dotClass: '',          badgeClass: 'status-down'     },
  ERROR:    { label: 'error',    dotClass: '',          badgeClass: 'status-error'    },
};

export function AgentCard({
  name,
  displayName,
  status,
  description,
  href,
  icon: Icon,
  accentColor,
  accentColorRgb,
  hitlCount = 0,
  metrics,
}: AgentCardProps) {
  const cfg = statusConfig[status] ?? statusConfig.IDLE;
  const isSleeping = status === 'SLEEPING';
  const isRunning  = status === 'RUNNING';
  const isError    = status === 'ERROR';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn('relative', isSleeping && 'sleep-breathe')}
    >
      <Link
        href={href}
        className="block glass relative overflow-hidden transition-all duration-300 agent-glow-hover"
        style={{
          ['--agent-color' as string]: accentColor,
          ['--agent-color-rgb' as string]: accentColorRgb,
          ...(isRunning  ? { boxShadow: `0 0 12px rgba(${accentColorRgb}, 0.25), 0 0 0 1px ${accentColor}` } : {}),
          ...(isError    ? { boxShadow: '0 0 12px rgba(255,68,68,0.25), 0 0 0 1px #ff4444' } : {}),
          ...(isSleeping ? { opacity: 0.6 } : {}),
          ...(!isRunning && !isError ? { borderColor: `color-mix(in srgb, ${accentColor} 20%, var(--border))` } : {}),
        }}
      >
        {/* Running shimmer overlay */}
        {isRunning && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(135deg, transparent 0%, rgba(${accentColorRgb}, 0.04) 50%, transparent 100%)`,
            }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Header row */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div className="flex items-center gap-2">
            {/* Status orb */}
            <motion.div
              className="relative flex items-center justify-center w-8 h-8 rounded-full"
              style={{ background: `rgba(${accentColorRgb}, 0.1)`, border: `1px solid rgba(${accentColorRgb}, 0.25)` }}
              animate={isRunning ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Icon
                size={14}
                style={{ color: isSleeping ? 'var(--text-dim)' : accentColor }}
              />
              {isSleeping && (
                <span className="absolute -top-1 -right-1 text-[9px] text-dim">z</span>
              )}
            </motion.div>

            <div>
              <div className="text-xs font-medium text-primary leading-none mb-1">
                {displayName ?? name}
              </div>
              <div className={cn('status-badge', cfg.badgeClass)}>
                {cfg.dotClass && <span className={`pulse-dot ${cfg.dotClass}`} style={{ color: accentColor }} />}
                {cfg.label}
              </div>
            </div>
          </div>

          {/* HITL notification badge */}
          {hitlCount > 0 && (
            <div className="hitl-badge">{hitlCount > 9 ? '9+' : hitlCount}</div>
          )}
        </div>

        {/* Metrics */}
        <div className="px-4 pb-3 space-y-1.5">
          {metrics?.lastRun && (
            <div className="flex justify-between text-[11px]">
              <span className="text-dim">last run</span>
              <span className="text-secondary">{metrics.lastRun}</span>
            </div>
          )}
          {metrics?.nextRun && (
            <div className="flex justify-between text-[11px]">
              <span className="text-dim">next run</span>
              <span style={{ color: accentColor }} className="text-[11px] font-medium">{metrics.nextRun}</span>
            </div>
          )}
          {metrics?.totalRuns !== undefined && (
            <div className="flex justify-between text-[11px]">
              <span className="text-dim">total runs</span>
              <span className="text-secondary">{metrics.totalRuns}</span>
            </div>
          )}
          {metrics?.tokenCount && (
            <div className="flex justify-between text-[11px]">
              <span className="text-dim">tokens today</span>
              <span className="text-secondary">{metrics.tokenCount}</span>
            </div>
          )}
        </div>

        {/* Description footer */}
        <div
          className="px-4 py-2 border-t text-[10px] text-dim"
          style={{ borderColor: `rgba(${accentColorRgb}, 0.1)` }}
        >
          {description}
        </div>
      </Link>
    </motion.div>
  );
}
