import React from 'react';
import Link from 'next/link';
import { Mail, Calendar, DollarSign, Briefcase, Inbox, Activity } from 'lucide-react';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-mono">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-medium tracking-wide">
            <span className="text-secondary">&gt; </span>
            <span className="text-accent-cyan">jimmy's</span>
            <span className="text-secondary"> agents</span>
          </Link>
        </div>
        <Link href="/inbox" className="flex items-center gap-2 text-xs border border-border px-3 py-1.5 rounded hover:text-accent-violet hover:border-accent-violet transition-colors">
          <Inbox size={14} />
          <span>inbox</span>
        </Link>
      </header>
      
      <div className="flex flex-1">
        <aside className="w-64 border-r border-border bg-card p-4 hidden md:block">
          <div className="text-[10px] uppercase tracking-widest text-dim mb-4">Agents</div>
          <nav className="space-y-1">
            <NavLink href="/agent/gmail-agent" icon={<Mail size={14} />} label="gmail-agent" />
            <NavLink href="/agent/calendar-agent" icon={<Calendar size={14} />} label="calendar-agent" />
            <NavLink href="/agent/budget-agent" icon={<DollarSign size={14} />} label="budget-agent" />
          </nav>

          <div className="text-[10px] uppercase tracking-widest text-dim mt-8 mb-4">Workflows</div>
          <nav className="space-y-1">
            <NavLink href="/workflow/job-app-chain" icon={<Briefcase size={14} />} label="job-app-chain" />
          </nav>
        </aside>

        <main className="flex-1 p-6 overflow-y-auto h-[calc(100vh-60px)]">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link 
      href={href} 
      className="flex items-center gap-3 px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-hover rounded transition-colors"
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
