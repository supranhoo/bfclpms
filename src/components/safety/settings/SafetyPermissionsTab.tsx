import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Save, Loader2, ShieldCheck, UserCog, History, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { SAFETY_ROLES, SafetyRole } from '@/lib/safetyRoles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { format } from 'date-fns';

type PermKey = { key: string; category: 'nav' | 'action' | 'widget'; label: string; sort_order: number };
type RolePerm = { role: SafetyRole; permission_key: string; is_allowed: boolean };
type UserOverride = { user_id: string; permission_key: string; effect: 'allow' | 'deny'; reason: string | null };
type ProfileRow = { id: string; full_name: string | null; email: string | null };
type AuditRow = { id: string; event_type: string; entity_type: string; performed_by: string | null; details: any; created_at: string };

const sb = supabase as any;

function useCatalog() {
  return useQuery<PermKey[]>({
    queryKey: ['safety', 'perm-catalog'],
    queryFn: async () => {
      const { data, error } = await sb.from('safety_permission_keys').select('*').eq('is_active', true).order('sort_order');
      if (error) throw error;
      return (data ?? []) as PermKey[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useRolePerms() {
  return useQuery<RolePerm[]>({
    queryKey: ['safety', 'role-perms'],
    queryFn: async () => {
      const { data, error } = await sb.from('safety_role_permissions').select('*');
      if (error) throw error;
      return (data ?? []) as RolePerm[];
    },
    staleTime: 60 * 1000,
  });
}

function useUserOverrides() {
  return useQuery<UserOverride[]>({
    queryKey: ['safety', 'user-overrides'],
    queryFn: async () => {
      const { data, error } = await sb.from('safety_user_permission_overrides').select('*');
      if (error) throw error;
      return (data ?? []) as UserOverride[];
    },
    staleTime: 60 * 1000,
  });
}

/* ---------------- Matrix ---------------- */

function MatrixPanel() {
  const qc = useQueryClient();
  const { data: keys = [], isLoading: kl } = useCatalog();
  const { data: rows = [], isLoading: rl } = useRolePerms();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'nav' | 'action' | 'widget'>('all');

  const map = useMemo(() => {
    const m = new Map<string, boolean>();
    rows.forEach((r) => m.set(`${r.role}::${r.permission_key}`, r.is_allowed));
    return m;
  }, [rows]);

  const filtered = useMemo(() => {
    return keys.filter((k) => {
      if (category !== 'all' && k.category !== category) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return k.key.toLowerCase().includes(s) || k.label.toLowerCase().includes(s);
    });
  }, [keys, category, search]);

  const toggle = useMutation({
    mutationFn: async (p: { role: SafetyRole; key: string; allowed: boolean }) => {
      const { error } = await sb
        .from('safety_role_permissions')
        .upsert({ role: p.role, permission_key: p.key, is_allowed: p.allowed, updated_at: new Date().toISOString() }, { onConflict: 'role,permission_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['safety', 'role-perms'] });
      qc.invalidateQueries({ queryKey: ['safety', 'permissions'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to update permission'),
  });

  if (kl || rl) {
    return <div className="flex items-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading matrix…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search permissions…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={category} onValueChange={(v) => setCategory(v as any)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="nav">Navigation</SelectItem>
            <SelectItem value="action">Actions</SelectItem>
            <SelectItem value="widget">Widgets</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline">{filtered.length} keys</Badge>
      </div>

      <ScrollArea className="h-[520px] border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="text-left p-2 font-medium">Permission</th>
              {SAFETY_ROLES.filter((r) => r !== 'admin').map((r) => (
                <th key={r} className="text-center p-2 font-medium text-xs whitespace-nowrap">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => (
              <tr key={k.key} className="border-t hover:bg-muted/30">
                <td className="p-2">
                  <div className="font-medium text-xs">{k.label}</div>
                  <code className="text-[10px] text-muted-foreground">{k.key}</code>
                </td>
                {SAFETY_ROLES.filter((r) => r !== 'admin').map((role) => {
                  const k2 = `${role}::${k.key}`;
                  // missing row = open default = allowed
                  const checked = map.has(k2) ? !!map.get(k2) : true;
                  return (
                    <td key={role} className="text-center p-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggle.mutate({ role, key: k.key, allowed: !!v })}
                        disabled={toggle.isPending}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      <p className="text-xs text-muted-foreground">
        Admin role is always allowed everything (not shown). Empty cell = inherits open default (allowed).
      </p>
    </div>
  );
}

/* ---------------- User overrides ---------------- */

function OverridesPanel() {
  const qc = useQueryClient();
  const { data: keys = [] } = useCatalog();
  const { data: overrides = [] } = useUserOverrides();
  const [userId, setUserId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: profiles = [] } = useQuery<ProfileRow[]>({
    queryKey: ['safety', 'profiles-mini', search],
    queryFn: async () => {
      let qb = sb.from('profiles').select('id, full_name, email').eq('is_active', true).limit(20);
      if (search) qb = qb.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    staleTime: 30_000,
  });

  const userOverrides = overrides.filter((o) => o.user_id === userId);
  const ovMap = new Map(userOverrides.map((o) => [o.permission_key, o.effect]));

  const setOverride = useMutation({
    mutationFn: async (p: { key: string; effect: 'allow' | 'deny' | null }) => {
      if (!userId) return;
      if (p.effect === null) {
        const { error } = await sb.from('safety_user_permission_overrides').delete().eq('user_id', userId).eq('permission_key', p.key);
        if (error) throw error;
      } else {
        const { error } = await sb.from('safety_user_permission_overrides')
          .upsert({ user_id: userId, permission_key: p.key, effect: p.effect }, { onConflict: 'user_id,permission_key' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['safety', 'user-overrides'] });
      qc.invalidateQueries({ queryKey: ['safety', 'permissions'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Failed to update override'),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search by name / email…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        {userId && (
          <Button variant="ghost" size="sm" onClick={() => setUserId(null)}><X className="h-3 w-3 mr-1" /> Clear</Button>
        )}
      </div>

      {!userId ? (
        <div className="border rounded-md divide-y">
          {profiles.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No matches.</div>
          ) : profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => setUserId(p.id)}
              className="w-full text-left p-2 hover:bg-muted/50 flex items-center justify-between text-sm"
            >
              <span>{p.full_name ?? '—'}</span>
              <span className="text-xs text-muted-foreground">{p.email ?? ''}</span>
            </button>
          ))}
        </div>
      ) : (
        <ScrollArea className="h-[480px] border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2">Permission</th>
                <th className="text-center p-2 w-[140px]">Override</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const cur = ovMap.get(k.key) ?? 'inherit';
                return (
                  <tr key={k.key} className="border-t">
                    <td className="p-2">
                      <div className="font-medium text-xs">{k.label}</div>
                      <code className="text-[10px] text-muted-foreground">{k.key}</code>
                    </td>
                    <td className="p-2">
                      <Select
                        value={cur}
                        onValueChange={(v) => setOverride.mutate({ key: k.key, effect: v === 'inherit' ? null : (v as any) })}
                      >
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inherit">Inherit</SelectItem>
                          <SelectItem value="allow">Allow</SelectItem>
                          <SelectItem value="deny">Deny</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      )}
    </div>
  );
}

/* ---------------- Audit ---------------- */

function AuditPanel() {
  const { data = [], isLoading } = useQuery<AuditRow[]>({
    queryKey: ['safety', 'perm-audit'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('safety_audit_log')
        .select('*')
        .in('entity_type', ['safety_role_permissions', 'safety_user_permission_overrides'])
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  if (isLoading) return <div className="flex items-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…</div>;
  if (data.length === 0) return <p className="text-sm text-muted-foreground py-6">No permission changes recorded yet.</p>;

  return (
    <ScrollArea className="h-[520px] border rounded-md">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0">
          <tr>
            <th className="text-left p-2">When</th>
            <th className="text-left p-2">Action</th>
            <th className="text-left p-2">Entity</th>
            <th className="text-left p-2">Key</th>
            <th className="text-left p-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className="p-2 text-xs whitespace-nowrap">{format(new Date(r.created_at), 'dd MMM HH:mm')}</td>
              <td className="p-2 text-xs"><Badge variant="outline">{r.event_type}</Badge></td>
              <td className="p-2 text-xs">{r.entity_type === 'safety_role_permissions' ? 'Role matrix' : 'User override'}</td>
              <td className="p-2"><code className="text-[10px]">{r.details?.permission_key ?? '—'}</code></td>
              <td className="p-2 text-[10px] text-muted-foreground max-w-[280px] truncate">
                {JSON.stringify(r.details?.new ?? r.details?.old ?? {})}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

/* ---------------- Tab shell ---------------- */

export default function SafetyPermissionsTab() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" /> Security & Permissions
        </CardTitle>
        <CardDescription>
          Configure which Safety menus, actions, and dashboard widgets each role can access. Admin role is always allowed everything.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="matrix">
          <TabsList>
            <TabsTrigger value="matrix"><ShieldCheck className="h-3 w-3 mr-1" /> Role Matrix</TabsTrigger>
            <TabsTrigger value="overrides"><UserCog className="h-3 w-3 mr-1" /> User Overrides</TabsTrigger>
            <TabsTrigger value="audit"><History className="h-3 w-3 mr-1" /> Audit</TabsTrigger>
          </TabsList>
          <TabsContent value="matrix" className="mt-4"><MatrixPanel /></TabsContent>
          <TabsContent value="overrides" className="mt-4"><OverridesPanel /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditPanel /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}