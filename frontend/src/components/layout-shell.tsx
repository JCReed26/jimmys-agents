"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Mail, Calendar, DollarSign, GitBranch,
  LayoutDashboard, Inbox, ScrollText, Activity,
  CalendarClock, Settings, User, ChevronRight,
  Zap, BarChart3, PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";

interface NavCounts {
  hitl: number;
  hotlUnread: number;
}

// ─── Nav structure ────────────────────────────────────────────────

const overviewLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
];

const agentLinks = [
  { href: "/agent/gmail-agent",    label: "Gmail",    icon: Mail,        color: "var(--agent-gmail)" },
  { href: "/agent/calendar-agent", label: "Calendar", icon: Calendar,    color: "var(--agent-calendar)" },
  { href: "/agent/budget-agent",   label: "Budget",   icon: DollarSign,  color: "var(--agent-budget)" },
];

const workflowLinks = [
  { href: "/workflow/job-app-chain", label: "Job Applications", icon: GitBranch, color: "var(--agent-job)" },
];

const systemLinks = [
  { href: "/profile",   label: "Profile",  icon: User },
  { href: "/settings",  label: "Settings", icon: Settings },
];

// ─── Layout shell ─────────────────────────────────────────────────

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [counts, setCounts] = useState<NavCounts>({ hitl: 0, hotlUnread: 0 });

  useEffect(() => {
    async function fetchCounts() {
      try {
        const r = await fetch("/api/nav-counts", { cache: "no-store" });
        if (r.ok) setCounts(await r.json());
      } catch { /* silently ignore */ }
    }
    fetchCounts();
    const iv = setInterval(fetchCounts, 15000);
    return () => clearInterval(iv);
  }, []);

  const monitoringLinks = [
    { href: "/observe",   label: "Observability", icon: BarChart3 },
    { href: "/logs",      label: "Run Logs",       icon: ScrollText,  badge: counts.hotlUnread },
    { href: "/inbox",     label: "HITL Inbox",     icon: Inbox,       badge: counts.hitl },
    { href: "/schedules", label: "Schedules",      icon: CalendarClock },
  ];

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        {/* Header */}
        <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--agent-calendar)]" />
            <span className="font-semibold text-sm tracking-tight group-data-[collapsible=icon]:hidden">
              Jimmy&apos;s Agents
            </span>
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2 py-2">
          {/* Overview */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {overviewLinks.map((item) => (
                  <NavItem key={item.href} {...item} pathname={pathname} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <Separator className="mx-2 my-1 bg-sidebar-border" />

          {/* Agents */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2 pb-1">
              Agents
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {agentLinks.map((item) => (
                  <NavItem key={item.href} {...item} pathname={pathname} accentColor={item.color} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <Separator className="mx-2 my-1 bg-sidebar-border" />

          {/* Workflows */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2 pb-1">
              Workflows
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {workflowLinks.map((item) => (
                  <NavItem key={item.href} {...item} pathname={pathname} accentColor={item.color} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <Separator className="mx-2 my-1 bg-sidebar-border" />

          {/* Monitoring */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-2 pb-1">
              Monitoring
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {monitoringLinks.map((item) => (
                  <NavItem key={item.href} {...item} pathname={pathname} badge={item.badge} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
          <SidebarMenu>
            {systemLinks.map((item) => (
              <NavItem key={item.href} {...item} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      {/* Main content area */}
      <SidebarInset>
        {/* Top bar */}
        <header className="flex h-12 items-center gap-3 border-b border-border px-4 sticky top-0 bg-background z-10">
          <SidebarTrigger className="h-7 w-7" />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb pathname={pathname} />
          <div className="ml-auto flex items-center gap-2">
            {counts.hitl > 0 && (
              <Link href="/inbox">
                <Badge variant="destructive" className="text-xs font-mono cursor-pointer">
                  {counts.hitl} pending
                </Badge>
              </Link>
            )}
            {counts.hotlUnread > 0 && (
              <Link href="/logs">
                <Badge
                  variant="outline"
                  className="text-xs font-mono cursor-pointer border-amber-500/40 text-amber-400"
                >
                  {counts.hotlUnread} unread
                </Badge>
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

// ─── Nav item ─────────────────────────────────────────────────────

interface NavItemProps {
  href: string;
  label: string;
  icon: React.ElementType;
  pathname: string;
  accentColor?: string;
  badge?: number;
}

function NavItem({ href, label, icon: Icon, pathname, accentColor, badge }: NavItemProps) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={label}>
        <Link href={href} className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Icon
              className="h-4 w-4 shrink-0"
              style={active && accentColor ? { color: accentColor } : undefined}
            />
            <span
              className="text-sm"
              style={active && accentColor ? { color: accentColor } : undefined}
            >
              {label}
            </span>
          </span>
          {badge && badge > 0 ? (
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : active && !accentColor ? (
            <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground/50" />
          ) : null}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────

function Breadcrumb({ pathname }: { pathname: string }) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return <span className="text-sm text-muted-foreground">Dashboard</span>;
  }
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      {segments.map((seg, i) => (
        <React.Fragment key={seg}>
          {i > 0 && <span className="text-muted-foreground/40">/</span>}
          <span className={cn(i === segments.length - 1 && "text-foreground font-medium capitalize")}>
            {seg.replace(/-/g, " ")}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
