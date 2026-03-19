"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Mail, Calendar, DollarSign, Briefcase,
  LayoutDashboard, Inbox, ScrollText, Activity,
  CalendarClock, BarChart2, Search, Users, Settings,
  ChevronRight, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavCounts {
  hitl: number;
  hotlUnread: number;
}

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>({ hitl: 0, hotlUnread: 0 });

  // Poll notification counts every 15s
  useEffect(() => {
    async function fetchCounts() {
      try {
        const r = await fetch('/api/nav-counts', { cache: 'no-store' });
        if (r.ok) setCounts(await r.json());
      } catch { /* silently ignore */ }
    }
    fetchCounts();
    const iv = setInterval(fetchCounts, 15000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground" style={{ fontFamily: 'var(--font-mono)' }}>
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface z-10 sticky top-0">
        <Link href="/" className="flex items-center gap-2">
          <Zap size={14} className="text-accent-cyan" />
          <span className="text-sm font-medium tracking-wide">
            <span className="text-secondary">/</span>
            <span className="text-accent-cyan">jimmy</span>
            <span className="text-secondary">'s-agents</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {counts.hitl > 0 && (
            <Link
              href="/inbox"
              className="flex items-center gap-1.5 text-[11px] text-red-400 border border-red-500/30 px-2.5 py-1 rounded bg-red-500/05 hover:bg-red-500/10 transition-colors"
            >
              <Inbox size={11} />
              <span>{counts.hitl} pending</span>
            </Link>
          )}
          {counts.hotlUnread > 0 && (
            <Link
              href="/hotl"
              className="flex items-center gap-1.5 text-[11px] text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded bg-amber-500/05 hover:bg-amber-500/10 transition-colors"
            >
              <ScrollText size={11} />
              <span>{counts.hotlUnread} unread</span>
            </Link>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-52 border-r border-border bg-surface flex flex-col gap-1 py-4 px-2 hidden md:flex shrink-0 overflow-y-auto">
          {/* Main nav */}
          <SideSection label="Overview">
            <SideLink href="/" icon={<LayoutDashboard size={13} />} label="fleet" pathname={pathname} />
            <SideLink href="/search" icon={<Search size={13} />} label="search" pathname={pathname} />
            <SideLink href="/stats" icon={<BarChart2 size={13} />} label="stats" pathname={pathname} />
          </SideSection>

          <SideSection label="Human Loop">
            <SideLink href="/inbox" icon={<Inbox size={13} />} label="hitl inbox" pathname={pathname} badge={counts.hitl} badgeColor="#ff4444" />
            <SideLink href="/hotl" icon={<ScrollText size={13} />} label="hotl feed" pathname={pathname} badge={counts.hotlUnread} badgeColor="#f59e0b" />
          </SideSection>

          <SideSection label="Operations">
            <SideLink href="/schedules" icon={<CalendarClock size={13} />} label="schedules" pathname={pathname} />
            <SideLink href="/council" icon={<Users size={13} />} label="council" pathname={pathname} />
            <SideLink href="/settings" icon={<Settings size={13} />} label="settings" pathname={pathname} />
          </SideSection>

          <SideSection label="Agents">
            <AgentLink href="/agent/gmail-agent"    icon={<Mail size={13} />}        label="gmail" color="var(--agent-gmail)"    pathname={pathname} />
            <AgentLink href="/agent/calendar-agent" icon={<Calendar size={13} />}    label="calendar" color="var(--agent-calendar)" pathname={pathname} />
            <AgentLink href="/agent/budget-agent"   icon={<DollarSign size={13} />}  label="budget" color="var(--agent-budget)"   pathname={pathname} />
            <AgentLink href="/agent/job-app-chain"  icon={<Briefcase size={13} />}   label="job-chain" color="var(--agent-job)"      pathname={pathname} />
          </SideSection>
        </aside>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto h-[calc(100vh-49px)] p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   Sidebar helpers
   ───────────────────────────────────────── */

function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-2 mb-1 text-[9px] uppercase tracking-widest text-muted font-medium">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

interface SideLinkProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  pathname: string;
  badge?: number;
  badgeColor?: string;
}

function SideLink({ href, icon, label, pathname, badge, badgeColor }: SideLinkProps) {
  const active = pathname === href || (href !== '/' && pathname.startsWith(href));
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center justify-between px-2 py-1.5 rounded text-[11px] transition-colors group',
        active ? 'bg-hover text-primary' : 'text-secondary hover:text-primary hover:bg-hover'
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {badge && badge > 0 ? (
        <span
          className="text-[9px] font-bold px-1.5 py-0 rounded-full border"
          style={{ color: badgeColor, borderColor: badgeColor, background: `${badgeColor}15` }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : active ? (
        <ChevronRight size={10} className="text-dim" />
      ) : null}
    </Link>
  );
}

function AgentLink({ href, icon, label, color, pathname }: SideLinkProps & { color: string }) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors',
        active ? 'text-primary bg-hover' : 'text-secondary hover:text-primary hover:bg-hover'
      )}
    >
      <span style={{ color: active ? color : undefined }}>{icon}</span>
      <span style={{ color: active ? color : undefined }}>{label}</span>
    </Link>
  );
}
