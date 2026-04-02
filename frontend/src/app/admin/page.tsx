"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Building2, Bot, Users, Plus, Trash2, Loader2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ui/error-boundary";

interface Tenant { id: string; name: string; is_active: boolean; created_at: string }
interface AgentReg { id: string; name: string; display_name: string; port: number; accent_color: string }
interface TenantUser { id: string; email: string; tenant_id: string }

const JAMES_TENANT = process.env.NEXT_PUBLIC_ADMIN_TENANT_ID ?? "4efdeb00-1b23-4031-bc77-555af005a406";

export default function AdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [agents, setAgents] = useState<AgentReg[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>(JAMES_TENANT);
  const [newTenantName, setNewTenantName] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { loadUsers(); }, [selectedTenant]);

  async function loadAll() {
    setLoading(true);
    const [tRes, aRes] = await Promise.all([
      fetch("/api/admin/tenants"),
      fetch("/api/admin/agents"),
    ]);
    if (tRes.ok) setTenants((await tRes.json()).tenants ?? []);
    if (aRes.ok) setAgents((await aRes.json()).agents ?? []);
    await loadUsers();
    setLoading(false);
  }

  async function loadUsers() {
    const r = await fetch(`/api/admin/users?tenant_id=${selectedTenant}`);
    if (r.ok) setUsers((await r.json()).users ?? []);
  }

  async function createTenant() {
    if (!newTenantName.trim()) return;
    setSaving("tenant");
    const r = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTenantName.trim() }),
    });
    if (r.ok) { setNewTenantName(""); loadAll(); }
    setSaving("");
  }

  async function assignAgent(agentName: string) {
    setSaving(agentName);
    await fetch("/api/admin/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: selectedTenant, agent_name: agentName }),
    });
    setSaving("");
    loadAll();
  }

  async function removeAgent(agentName: string) {
    setSaving(agentName);
    await fetch("/api/admin/agents", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: selectedTenant, agent_name: agentName }),
    });
    setSaving("");
    loadAll();
  }

  async function addUser() {
    if (!newUserId.trim()) return;
    setSaving("user");
    await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: newUserId.trim(), tenant_id: selectedTenant }),
    });
    setNewUserId("");
    setSaving("");
    loadUsers();
  }

  async function removeUser(userId: string) {
    setSaving(userId);
    await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, tenant_id: selectedTenant }),
    });
    setSaving("");
    loadUsers();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Shield className="h-5 w-5 text-amber-400" />
        <div>
          <h1 className="text-lg font-semibold">Admin</h1>
          <p className="text-sm text-muted-foreground">Manage tenants, agents, and user access</p>
        </div>
      </div>

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants"><Building2 className="h-3.5 w-3.5 mr-1.5" />Tenants</TabsTrigger>
          <TabsTrigger value="agents"><Bot className="h-3.5 w-3.5 mr-1.5" />Agents</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-3.5 w-3.5 mr-1.5" />Users</TabsTrigger>
        </TabsList>

        {/* ── Tenants ── */}
        <TabsContent value="tenants" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Create Tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Tenant name"
                  value={newTenantName}
                  onChange={e => setNewTenantName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createTenant()}
                  className="max-w-xs"
                />
                <Button size="sm" onClick={createTenant} disabled={saving === "tenant"}>
                  {saving === "tenant" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">All Tenants ({tenants.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tenants.map((t, i) => (
                <div key={t.id}>
                  {i > 0 && <Separator />}
                  <div
                    className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors ${selectedTenant === t.id ? "bg-muted/60" : ""}`}
                    onClick={() => setSelectedTenant(t.id)}
                  >
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{t.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {t.id === JAMES_TENANT && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">superadmin</Badge>}
                      <Badge variant={t.is_active ? "default" : "secondary"} className="text-[10px]">
                        {t.is_active ? "active" : "inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Agents ── */}
        <TabsContent value="agents" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">
            Viewing agents for: <span className="font-mono text-foreground">{tenants.find(t => t.id === selectedTenant)?.name ?? selectedTenant}</span>
            <span className="ml-2 text-muted-foreground/60">(select a tenant in the Tenants tab to switch)</span>
          </p>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Agent Registry</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {agents.map((a, i) => (
                <div key={a.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: a.accent_color }} />
                      <div>
                        <p className="text-sm font-medium">{a.display_name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{a.name} · :{a.port}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => assignAgent(a.name)} disabled={saving === a.name}>
                        {saving === a.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                        Assign
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => removeAgent(a.name)} disabled={saving === a.name}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Users ── */}
        <TabsContent value="users" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground">
            Viewing users for: <span className="font-mono text-foreground">{tenants.find(t => t.id === selectedTenant)?.name ?? selectedTenant}</span>
          </p>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Add User to Tenant</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Supabase auth user UUID"
                  value={newUserId}
                  onChange={e => setNewUserId(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addUser()}
                  className="max-w-sm font-mono text-xs"
                />
                <Button size="sm" onClick={addUser} disabled={saving === "user"}>
                  {saving === "user" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Users ({users.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {users.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">No users linked to this tenant.</p>
              ) : users.map((u, i) => (
                <div key={u.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm">{u.email || "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{u.id}</p>
                    </div>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-destructive hover:text-destructive"
                      onClick={() => removeUser(u.id)}
                      disabled={saving === u.id}
                    >
                      {saving === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </ErrorBoundary>
  );
}
