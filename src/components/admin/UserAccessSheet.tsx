/**
 * UserAccessSheet — per-user cockpit reused by both
 *  - Identity & Access Console (PersonDrawer)
 *  - User Management (per-row "Manage Access" action)
 *
 * Tabs: Roles | Password | Audit
 * No schema changes; relies on existing edge functions and hooks.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, UserPlus, Trash2, Mail, KeyRound, ShieldCheck, History, Inbox, Search, ExternalLink, AlertTriangle } from 'lucide-react';
import { useIacAssignments, useIacRoles, useGrantRole, useRevokeAssignment } from '@/hooks/useIac';

export interface UserAccessSheetUser {
  id: string;
  full_name: string | null;
  email: string | null;
  employee_code?: string | null;
  has_real_email?: boolean | null;
  portal_access?: boolean | null;
}

export type UserAccessSheetTab = 'roles' | 'password' | 'audit';

interface Props {
  user: UserAccessSheetUser | null;
  defaultTab?: UserAccessSheetTab;
  onClose: () => void;
}

export function UserAccessSheet({ user, defaultTab = 'roles', onClose }: Props) {
  const [tab, setTab] = useState<UserAccessSheetTab>(defaultTab);
  useEffect(() => { if (user) setTab(defaultTab); }, [user, defaultTab]);

  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {user?.full_name || user?.email || 'User'}
          </SheetTitle>
          <SheetDescription>
            {user?.email}
            {user?.employee_code ? ` · ${user.employee_code}` : ''}
          </SheetDescription>
        </SheetHeader>

        {user && (
          <Tabs value={tab} onValueChange={(v) => setTab(v as UserAccessSheetTab)} className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="roles"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Roles</TabsTrigger>
              <TabsTrigger value="password"><KeyRound className="h-3.5 w-3.5 mr-1" />Password</TabsTrigger>
              <TabsTrigger value="audit"><History className="h-3.5 w-3.5 mr-1" />Audit</TabsTrigger>
            </TabsList>
            <TabsContent value="roles" className="mt-4"><RolesPanel user={user} /></TabsContent>
            <TabsContent value="password" className="mt-4"><PasswordPanel user={user} /></TabsContent>
            <TabsContent value="audit" className="mt-4"><AuditPanel user={user} /></TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Roles
// ============================================================
function RolesPanel({ user }: { user: UserAccessSheetUser }) {
  const { toast } = useToast();
  const roles = useIacRoles();
  const assignments = useIacAssignments();
  const grant = useGrantRole();
  const revoke = useRevokeAssignment();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [granting, setGranting] = useState(false);

  const userAssignments = useMemo(
    () => (assignments.data ?? []).filter((a) => a.user_id === user.id),
    [assignments.data, user.id],
  );
  const roleById = useMemo(() => {
    const m = new Map<string, { name: string; module: string }>();
    (roles.data ?? []).forEach((r) => m.set(r.id, { name: r.name, module: r.module }));
    return m;
  }, [roles.data]);

  // Roles the user already holds (any scope) — to hide / mark in the picker.
  const heldRoleIds = useMemo(
    () => new Set(userAssignments.map((a) => a.role_id)),
    [userAssignments],
  );

  // Group available roles by module, filtered by search + excluding already-held.
  const groupedAvailable = useMemo(() => {
    const all = roles.data ?? [];
    const term = search.trim().toLowerCase();
    const filtered = all.filter((r) => {
      if (heldRoleIds.has(r.id)) return false;
      if (!term) return true;
      return r.name.toLowerCase().includes(term) || r.module.toLowerCase().includes(term);
    });
    const map = new Map<string, typeof filtered>();
    for (const r of filtered) {
      const key = r.module || 'Other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [roles.data, search, heldRoleIds]);

  // Group current assignments by module for display.
  const groupedHeld = useMemo(() => {
    const map = new Map<string, typeof userAssignments>();
    for (const a of userAssignments) {
      const mod = roleById.get(a.role_id)?.module || 'Other';
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(a);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [userAssignments, roleById]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGrantAll = async () => {
    if (selected.size === 0) return;
    setGranting(true);
    const ids = Array.from(selected);
    let ok = 0;
    const failures: string[] = [];
    // Sequential to keep audit log clean.
    for (const role_id of ids) {
      try {
        await grant.mutateAsync({ user_id: user.id, role_id });
        ok++;
      } catch (e) {
        const name = roleById.get(role_id)?.name ?? role_id;
        failures.push(`${name}: ${(e as Error).message}`);
      }
    }
    setGranting(false);
    setSelected(new Set());
    if (failures.length === 0) {
      toast({ title: `Granted ${ok} role${ok === 1 ? '' : 's'}` });
    } else {
      toast({
        title: `Granted ${ok}, failed ${failures.length}`,
        description: failures.slice(0, 3).join(' · '),
        variant: failures.length === ids.length ? 'destructive' : 'default',
      });
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      toast({ title: 'Role revoked' });
    } catch (e) {
      toast({ title: 'Revoke failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Grant roles</h3>
          <span className="text-xs text-muted-foreground">
            A user can hold multiple roles across modules.
          </span>
        </div>
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search roles or modules…"
            className="pl-7 h-9 text-sm"
          />
        </div>
        <ScrollArea className="h-56 border rounded-md">
          <div className="p-2 space-y-3">
            {groupedAvailable.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">
                {roles.isLoading ? 'Loading…' : 'No more roles to grant.'}
              </p>
            ) : (
              groupedAvailable.map(([mod, list]) => (
                <div key={mod}>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 px-1">
                    {mod}
                  </div>
                  <div className="space-y-0.5">
                    {list.map((r) => (
                      <label
                        key={r.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={selected.has(r.id)}
                          onCheckedChange={() => toggle(r.id)}
                        />
                        <span className="flex-1 truncate">{r.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
          <Button onClick={handleGrantAll} disabled={selected.size === 0 || granting} size="sm">
            {granting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Granting…</>
            ) : (
              <><UserPlus className="h-4 w-4 mr-2" />Grant {selected.size || ''}</>
            )}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
          Need to assign roles to many users at once?{' '}
          <Link to="/admin/iac?tab=bulk" className="text-primary inline-flex items-center gap-0.5 hover:underline">
            Use Bulk Importer <ExternalLink className="h-3 w-3" />
          </Link>
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Current assignments</h3>
          <Badge variant="secondary">{userAssignments.length}</Badge>
        </div>
        {userAssignments.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            No roles yet — user cannot access any module.
          </p>
        ) : (
          <div className="space-y-3">
            {groupedHeld.map(([mod, list]) => (
              <div key={mod}>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  {mod} <span className="text-muted-foreground/60">· {list.length}</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((a) => {
                    const r = roleById.get(a.role_id);
                    const expired = a.expires_at && new Date(a.expires_at) < new Date();
                    return (
                      <div
                        key={a.id}
                        className={`flex items-center justify-between border rounded-md p-2 ${expired ? 'opacity-50' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r?.name ?? a.role_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.scope_type}
                            {a.expires_at ? ` · ${expired ? 'expired' : 'expires'} ${new Date(a.expires_at).toLocaleDateString()}` : ''}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevoke(a.id)}
                          disabled={revoke.isPending}
                          aria-label="Revoke"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Password
// ============================================================
interface RolloutLog {
  id: string;
  created_at: string;
  email_sent: boolean;
  status: string;
  email_error: string | null;
  error_message: string | null;
}

function PasswordPanel({ user }: { user: UserAccessSheetUser }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'email' | 'no_email' | null>(null);

  const { data: lastLog } = useQuery<RolloutLog | null>({
    queryKey: ['password-rollout-last', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('password_rollout_logs')
        .select('id, created_at, email_sent, status, email_error, error_message')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as RolloutLog | null) ?? null;
    },
  });

  const run = async (sendEmail: boolean) => {
    setBusy(sendEmail ? 'email' : 'no_email');
    try {
      const { data, error } = await supabase.functions.invoke('password-rollout', {
        body: { user_ids: [user.id], send_email: sendEmail },
      });
      if (error) throw new Error(error.message);
      const detail = (data as { details?: Array<{ status: string; error_message?: string }> } | null)?.details?.[0];
      if (detail?.status !== 'success') {
        throw new Error(detail?.error_message || 'Rollout failed');
      }
      toast({
        title: sendEmail ? 'Password generated & email sent' : 'Password generated',
        description: sendEmail
          ? 'Credentials emailed to the user.'
          : 'Share the password manually — user logs in via Employee Code.',
      });
      qc.invalidateQueries({ queryKey: ['password-rollout-last', user.id] });
    } catch (e) {
      toast({ title: 'Rollout failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const hasRealEmail = user.has_real_email !== false && !!user.email;
  const portalAccess = user.portal_access !== false;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap gap-2">
        {hasRealEmail
          ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400">Real email on file</Badge>
          : <Badge variant="secondary">No real email — synthetic login</Badge>}
        {portalAccess
          ? <Badge variant="outline">Portal access ON</Badge>
          : <Badge variant="destructive">Portal access OFF</Badge>}
      </section>

      <section className="space-y-2">
        <Button
          className="w-full"
          onClick={() => run(true)}
          disabled={busy !== null || !hasRealEmail}
          title={!hasRealEmail ? 'No real email — use "Generate without email" instead' : undefined}
        >
          {busy === 'email'
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating & emailing…</>
            : <><Mail className="h-4 w-4 mr-2" />Generate & email password</>}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => run(false)}
          disabled={busy !== null}
        >
          {busy === 'no_email'
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating…</>
            : <><KeyRound className="h-4 w-4 mr-2" />Generate without email</>}
        </Button>
      </section>

      <section>
        <h3 className="text-sm font-semibold mb-2">Last rollout</h3>
        {!lastLog ? (
          <p className="text-sm text-muted-foreground">No rollout has been performed for this user.</p>
        ) : (
          <div className="border rounded-md p-3 text-sm space-y-1">
            <p className="text-muted-foreground text-xs">
              {new Date(lastLog.created_at).toLocaleString()}
            </p>
            <p>
              Status:{' '}
              <Badge variant={lastLog.status === 'success' ? 'outline' : 'destructive'} className="ml-1">
                {lastLog.status}
              </Badge>
            </p>
            <p>Email: {lastLog.email_sent ? 'sent' : (lastLog.email_error || 'not sent')}</p>
            {lastLog.error_message && <p className="text-destructive text-xs">{lastLog.error_message}</p>}
          </div>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Audit
// ============================================================
interface IacAuditRow { id: number; action: string; target_type: string; target_id: string | null; created_at: string; }
interface EmailAuditRow { id: string; old_email: string | null; new_email: string | null; source: string | null; performed_at: string; }

function AuditPanel({ user }: { user: UserAccessSheetUser }) {
  const { data: iacRows, isLoading: iacLoading } = useQuery({
    queryKey: ['user-iac-audit', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('iac_audit_log')
        .select('id, action, target_type, target_id, created_at')
        .ilike('target_id', `${user.id}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return ((data ?? []) as unknown) as IacAuditRow[];
    },
  });

  const { data: emailRows } = useQuery({
    queryKey: ['user-email-audit', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_change_audit')
        .select('id, old_email, new_email, source, performed_at')
        .eq('user_id', user.id)
        .order('performed_at', { ascending: false })
        .limit(5);
      if (error) return [] as EmailAuditRow[]; // table may not be visible under RLS for non-admin contexts
      return ((data ?? []) as unknown) as EmailAuditRow[];
    },
  });

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-sm font-semibold mb-2">Access activity</h3>
        {iacLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !iacRows || iacRows.length === 0 ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2"><Inbox className="h-4 w-4" />No activity yet.</p>
        ) : (
          <div className="space-y-1.5">
            {iacRows.map((r) => (
              <div key={r.id} className="text-xs border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="font-mono">{r.action}</span>
                  <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {emailRows && emailRows.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Email changes</h3>
          <div className="space-y-1.5">
            {emailRows.map((r) => (
              <div key={r.id} className="text-xs border rounded p-2">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{r.old_email || '—'} → {r.new_email || '—'}</span>
                  <span className="text-muted-foreground">{new Date(r.performed_at).toLocaleString()}</span>
                </div>
                {r.source && <p className="text-muted-foreground mt-0.5">via {r.source}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}