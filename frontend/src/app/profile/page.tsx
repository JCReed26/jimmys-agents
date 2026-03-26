"use client";

import { useState } from "react";
import { AGENTS, WORKFLOWS } from "@/lib/agents";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { User, Zap, Eye, EyeOff, Check, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
  const [demoMode, setDemoMode] = useState(false);
  const [bio, setBio] = useState(
    "Solo AI agency specializing in audit-to-build cycles for small businesses. Personal agents handle Gmail triage, calendar management, budget tracking, and job application workflows."
  );
  const [bioSaved, setBioSaved] = useState(false);

  function saveBio() {
    setBioSaved(true);
    setTimeout(() => setBioSaved(false), 2000);
  }

  const agentList = Object.entries(AGENTS);
  const workflowList = Object.entries(WORKFLOWS);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-base font-semibold">Profile</h1>
        <p className="text-[12px] text-muted-foreground mt-0.5">Your identity and workspace context</p>
      </div>

      {/* Identity */}
      <Card className="bg-card border-border">
        <CardContent className="p-5 space-y-4">
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium">Identity</p>

          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[var(--agent-calendar)] to-[var(--agent-budget)] flex items-center justify-center shrink-0">
              <User className="h-7 w-7 text-black" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base">James Christopher</p>
              <p className="text-[12px] text-muted-foreground">Founder · Epoch Systems</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Building2 className="h-3 w-3 text-muted-foreground/50" />
                <span className="text-[11px] text-muted-foreground/60">West Orange County, FL</span>
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-muted-foreground block mb-1.5">Business context</label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              className="text-sm bg-background border-border resize-none"
            />
            <Button
              size="sm"
              className="mt-2 h-7 text-xs gap-1.5"
              variant="outline"
              onClick={saveBio}
            >
              {bioSaved ? <><Check className="h-3 w-3" /> Saved</> : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active agents */}
      <Card className="bg-card border-border">
        <CardContent className="p-5 space-y-4">
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium">Active agents</p>
          <div className="space-y-2">
            {agentList.map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-center gap-3 py-2">
                  <div
                    className="h-7 w-7 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cfg.accentColor}15`, border: `1px solid ${cfg.accentColor}25` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.accentColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{cfg.displayName}</span>
                    <p className="text-[11px] text-muted-foreground/60 truncate">{cfg.description}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1.5 font-mono shrink-0"
                    style={{ borderColor: `${cfg.accentColor}30`, color: cfg.accentColor }}
                  >
                    port {cfg.port}
                  </Badge>
                </div>
              );
            })}
          </div>

          <Separator />

          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-wider font-medium">Workflows</p>
          <div className="space-y-2">
            {workflowList.map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <div key={key} className="flex items-center gap-3 py-2">
                  <div
                    className="h-7 w-7 rounded flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cfg.accentColor}15`, border: `1px solid ${cfg.accentColor}25` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: cfg.accentColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{cfg.displayName}</span>
                    <p className="text-[11px] text-muted-foreground/60 truncate">{cfg.description}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[9px] h-4 px-1.5 font-mono shrink-0"
                    style={{ borderColor: `${cfg.accentColor}30`, color: cfg.accentColor }}
                  >
                    port {cfg.port}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Demo mode */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {demoMode ? (
                <Eye className="h-4 w-4 text-[var(--agent-calendar)]" />
              ) : (
                <EyeOff className="h-4 w-4 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">Demo mode</p>
                <p className="text-[12px] text-muted-foreground">
                  Hides system internals and shows client-friendly labels for presentations
                </p>
              </div>
            </div>
            <button
              onClick={() => setDemoMode((d) => !d)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
                demoMode ? "bg-[var(--agent-calendar)]" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200",
                  demoMode ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>
          {demoMode && (
            <div className="mt-3 px-3 py-2 bg-[var(--agent-calendar)]/10 border border-[var(--agent-calendar)]/20 rounded-md">
              <p className="text-[11px] text-[var(--agent-calendar)]">
                Demo mode active — system ports, raw logs, and internal IDs are hidden
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
