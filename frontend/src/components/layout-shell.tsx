"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, User, ChevronRight,
  Zap, LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";
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
  SidebarGroupContent,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";

// ─── Nav structure ────────────────────────────────────────────────

const overviewLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
];

// ─── Layout shell ─────────────────────────────────────────────────

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (pathname.startsWith("/login")) {
    return (
      <main className="flex-1 min-h-screen w-full items-center justify-center bg-background p-4">
        {children}
      </main>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar variant="inset" collapsible="icon">
        {/* Header */}
        <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[var(--agent-calendar)]" />
            <span className="font-semibold text-sm tracking-tight group-data-[collapsible=icon]:hidden">
              Jimmy's Agents
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

        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
          {/* User pill */}
          <div className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-sidebar-accent/40 transition-colors">
            <div className="flex items-center gap-2 min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="h-6 w-6 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
              <span className="text-xs text-muted-foreground truncate">
                Jimmy's Agents
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-3 w-3" />
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Main content area */}
      <SidebarInset>
        {/* Top bar */}
        <header className="flex h-12 items-center gap-3 border-b border-border px-4 sticky top-0 bg-background z-10">
          <SidebarTrigger className="h-7 w-7" />
          <Separator orientation="vertical" className="h-4" />
          <Breadcrumb pathname={pathname} />
          <div className="ml-auto" />
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
}

function NavItem({ href, label, icon: Icon, pathname, accentColor }: NavItemProps) {
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
          {active && !accentColor ? (
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
