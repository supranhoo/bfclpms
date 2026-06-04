import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, ShieldOff, UserPlus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ImplementersAuditTab } from '@/components/platform/ImplementersAuditTab';

/**
 * Phase 4D — Implementers management UI.
 *
 * Platform-owner-only screen for granting/revoking the `implementation_admin`
 * role and assigning per-client access. All mutations route through the
 * `manage-implementer` edge function so RLS-protected tables (`user_roles`)
 * are reached via service role with an immutable audit trail.
 *
 * Out of scope: PMS roles, menu/workflow/scoring/report/RLS behaviour.
 */

type Client = { id: string; client_key: string; display_name: string; is_active: boolean };
type Profile = { id: string; full_name: string | null; email: string | null; employee_code: string | null; is_active: boolean };
type Assignment = { id: string; user_id: string; client_id: string; created_at: string };

type ImplementerRow = {
  user: Profile;
  assignments: Array<Assignment & { client?: Client }>;
};

function maskEmail(email?: string | null) {
  if (!email) return '—';
  const [local, domain] = email.split('@');
  if (!domain || local.length <= 2) return email;
  return `${local.slice(0, 2)}***@${domain}`;
}

function callManageImplementer(body: Record<string, unknown>) {
  return supabase.functions.invoke('manage-implementer', { body });
}

export function ImplementersManageTab() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canWrite = hasRole('platform_owner');

  // ---- queries ---------------------------------------------------------
  const { data: clients } = useQuery({
    queryKey: ['platform-settings', 'clients-min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, client_key, display_name, is_active')
        .order('display_name');
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });

  const { data: roleRows, isLoading: rolesLoading } = useQuery({
    queryKey: ['platform-settings', 'impl-admin-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, user_id')
        .eq('role', 'implementation_admin');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; user_id: string }>;
    },
  });

  const userIds = useMemo(() => (roleRows ?? []).map((r) => r.user_id), [roleRows]);

  const { data: profiles } = useQuery({
    queryKey: ['platform-settings', 'impl-admin-profiles', userIds.join(',')],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code, is_active')
        .in('id', userIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ['platform-settings', 'impl-admin-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_implementer_assignments')
        .select('id, user_id, client_id, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Assignment[];
    },
  });

  // ---- shape rows ------------------------------------------------------
  const rows: ImplementerRow[] = useMemo(() => {
    if (!profiles) return [];
    const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
    const byUser = new Map<string, Assignment[]>();
    (assignments ?? []).forEach((a) => {
      const list = byUser.get(a.user_id) ?? [];
      list.push(a);
      byUser.set(a.user_id, list);
    });
    return profiles.map((p) => ({
      user: p,
      assignments: (byUser.get(p.id) ?? []).map((a) => ({ ...a, client: clientById.get(a.client_id) })),
    }));
  }, [profiles, assignments, clients]);

  // ---- dialogs/state ---------------------------------------------------
  const [addOpen, setAddOpen] = useState(false);
  const [manageRow, setManageRow] = useState<ImplementerRow | null>(null);
  const [revokeRow, setRevokeRow] = useState<ImplementerRow | null>(null);
  const [unassignTarget, setUnassignTarget] = useState<{ row: ImplementerRow; client: Client } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['platform-settings', 'impl-admin-roles'] });
    qc.invalidateQueries({ queryKey: ['platform-settings', 'impl-admin-profiles'] });
    qc.invalidateQueries({ queryKey: ['platform-settings', 'impl-admin-assignments'] });
  };

  // ---- mutations -------------------------------------------------------
  async function handleGrantWithAssignments(targetUserId: string, clientIds: string[]) {
    setBusy(true);
    try {
      const { data: grantData, error: grantErr } = await callManageImplementer({
        action: 'grant_role',
        target_user_id: targetUserId,
        reason: 'add via Platform Settings',
      });
      if (grantErr || (grantData as any)?.error) {
        throw new Error((grantData as any)?.error || grantErr?.message);
      }
      for (const cid of clientIds) {
        const { data, error } = await callManageImplementer({
          action: 'assign_client',
          target_user_id: targetUserId,
          client_id: cid,
          reason: 'add via Platform Settings',
        });
        if (error || (data as any)?.error) {
          throw new Error((data as any)?.error || error?.message);
        }
      }
      toast({ title: 'Implementer added', description: `Role granted${clientIds.length ? ` and ${clientIds.length} client(s) assigned.` : '.'}` });
      setAddOpen(false);
      refresh();
    } catch (e: any) {
      toast({ title: 'Add failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignClient(targetUserId: string, clientId: string) {
    setBusy(true);
    try {
      const { data, error } = await callManageImplementer({
        action: 'assign_client',
        target_user_id: targetUserId,
        client_id: clientId,
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: 'Client assigned' });
      refresh();
    } catch (e: any) {
      toast({ title: 'Assign failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(targetUserId: string, clientId: string) {
    setBusy(true);
    try {
      const { data, error } = await callManageImplementer({
        action: 'unassign_client',
        target_user_id: targetUserId,
        client_id: clientId,
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: 'Client unassigned' });
      setUnassignTarget(null);
      refresh();
    } catch (e: any) {
      toast({ title: 'Unassign failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke(targetUserId: string) {
    setBusy(true);
    try {
      const { data, error } = await callManageImplementer({
        action: 'revoke_role',
        target_user_id: targetUserId,
        reason: 'revoke via Platform Settings',
      });
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast({ title: 'Implementer revoked', description: 'Role and all client assignments removed.' });
      setRevokeRow(null);
      refresh();
    } catch (e: any) {
      toast({ title: 'Revoke failed', description: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite) {
    return (
      <Alert>
        <AlertDescription>Only platform owners can manage implementer assignments.</AlertDescription>
      </Alert>
    );
  }

  const loading = rolesLoading;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Implementation Admins</CardTitle>
            <CardDescription>
              Grant the <code className="text-xs">implementation_admin</code> role and assign per-client access to
              the Implementation Console. Does not alter PMS roles.
            </CardDescription>
          </div>
          <Button onClick={() => setAddOpen(true)} disabled={busy}>
            <UserPlus className="h-4 w-4 mr-1" /> Add implementer
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 inline animate-spin mr-2" /> Loading implementers…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No implementation admins yet. Click <strong>Add implementer</strong> to grant access.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const isSelf = row.user.id === user?.id;
                const isInactive = row.user.is_active === false;
                return (
                  <div key={row.user.id} className="border rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{row.user.full_name || maskEmail(row.user.email)}</span>
                        <Badge variant="secondary" className="text-[10px]">implementation_admin</Badge>
                        {row.user.employee_code && (
                          <Badge variant="outline" className="text-[10px]">{row.user.employee_code}</Badge>
                        )}
                        {isSelf && <Badge variant="outline" className="text-[10px]">you</Badge>}
                        {isInactive && <Badge variant="destructive" className="text-[10px]">inactive</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">{maskEmail(row.user.email)}</div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {row.assignments.length === 0 ? (
                          <span className="text-xs italic text-muted-foreground">No clients assigned</span>
                        ) : (
                          row.assignments.map((a) => (
                            <Badge
                              key={a.id}
                              variant="outline"
                              className="gap-1 pl-2 pr-1 py-0.5 hover:bg-muted"
                            >
                              {a.client?.display_name ?? a.client_id.slice(0, 8)}
                              <button
                                onClick={() => a.client && setUnassignTarget({ row, client: a.client })}
                                disabled={busy || !a.client}
                                className="ml-0.5 rounded-sm hover:bg-destructive/10 hover:text-destructive p-0.5"
                                aria-label={`Unassign ${a.client?.display_name}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setManageRow(row)} disabled={busy}>
                        <Plus className="h-4 w-4 mr-1" /> Assign clients
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRevokeRow(row)}
                        disabled={busy || isSelf}
                        title={isSelf ? 'You cannot revoke your own role here' : 'Revoke implementer'}
                      >
                        <ShieldOff className="h-4 w-4 mr-1" /> Revoke
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AddImplementerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        clients={clients ?? []}
        existingUserIds={new Set(userIds)}
        submitting={busy}
        onSubmit={handleGrantWithAssignments}
      />

      {manageRow && (
        <ManageClientsDialog
          row={manageRow}
          clients={clients ?? []}
          submitting={busy}
          onClose={() => setManageRow(null)}
          onAssign={(cid) => handleAssignClient(manageRow.user.id, cid)}
        />
      )}

      <ConfirmDestructiveDialog
        open={!!revokeRow}
        onCancel={() => setRevokeRow(null)}
        onConfirm={() => revokeRow && handleRevoke(revokeRow.user.id)}
        title="Revoke implementer access?"
        description={
          revokeRow
            ? `This removes the implementation_admin role from ${
                revokeRow.user.full_name || maskEmail(revokeRow.user.email)
              } and clears their ${revokeRow.assignments.length} client assignment(s). PMS roles are not affected. Action is audited.`
            : ''
        }
        confirmLabel="Revoke"
        isLoading={busy}
      />

      <ConfirmDestructiveDialog
        open={!!unassignTarget}
        onCancel={() => setUnassignTarget(null)}
        onConfirm={() =>
          unassignTarget && handleUnassign(unassignTarget.row.user.id, unassignTarget.client.id)
        }
        title="Unassign client?"
        description={
          unassignTarget
            ? `Remove access to “${unassignTarget.client.display_name}” for ${
                unassignTarget.row.user.full_name || maskEmail(unassignTarget.row.user.email)
              }. The implementation_admin role is kept. Action is audited.`
            : ''
        }
        confirmLabel="Unassign"
        isLoading={busy}
      />
    </div>
  );
}

// =====================================================================
// Add Implementer dialog — user search + client multi-select
// =====================================================================

function AddImplementerDialog({
  open,
  onOpenChange,
  clients,
  existingUserIds,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: Client[];
  existingUserIds: Set<string>;
  submitting: boolean;
  onSubmit: (userId: string, clientIds: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());

  const { data: results, isFetching } = useQuery({
    queryKey: ['platform-settings', 'user-search', search],
    enabled: open && search.trim().length >= 2,
    queryFn: async () => {
      const term = `%${search.trim()}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code, is_active')
        .or(`full_name.ilike.${term},email.ilike.${term},employee_code.ilike.${term}`)
        .eq('is_active', true)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const reset = () => {
    setSearch('');
    setSelectedUser(null);
    setSelectedClients(new Set());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add implementation admin</DialogTitle>
          <DialogDescription>
            Grant the <code className="text-xs">implementation_admin</code> role and optionally assign initial
            client access. PMS roles for this user are untouched.
          </DialogDescription>
        </DialogHeader>

        {!selectedUser ? (
          <div className="space-y-3">
            <Label htmlFor="impl-search">Search user (name, email, or employee code)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="impl-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type at least 2 characters…"
                className="pl-8"
              />
            </div>
            <ScrollArea className="h-64 border rounded-md">
              {search.trim().length < 2 ? (
                <div className="p-4 text-sm text-muted-foreground">Start typing to search active users.</div>
              ) : isFetching ? (
                <div className="p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 inline animate-spin mr-1" /> Searching…
                </div>
              ) : (results ?? []).length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No matching active users.</div>
              ) : (
                <ul className="divide-y">
                  {results!.map((p) => {
                    const already = existingUserIds.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between gap-2"
                          disabled={already}
                          onClick={() => setSelectedUser(p)}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">
                              {p.full_name || maskEmail(p.email)}
                            </span>
                            <span className="block text-xs text-muted-foreground truncate">
                              {maskEmail(p.email)} {p.employee_code ? `• ${p.employee_code}` : ''}
                            </span>
                          </span>
                          {already && <Badge variant="secondary" className="text-[10px]">already implementer</Badge>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-md p-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {selectedUser.full_name || maskEmail(selectedUser.email)}
                </div>
                <div className="text-xs text-muted-foreground truncate font-mono">
                  {maskEmail(selectedUser.email)}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>
                Change
              </Button>
            </div>

            <div>
              <Label className="mb-2 block">Assign clients (optional)</Label>
              <ScrollArea className="h-48 border rounded-md p-2">
                {clients.length === 0 ? (
                  <div className="text-sm text-muted-foreground p-2">No clients available.</div>
                ) : (
                  <div className="space-y-1.5">
                    {clients.map((c) => {
                      const checked = selectedClients.has(c.id);
                      return (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = new Set(selectedClients);
                              if (v) next.add(c.id);
                              else next.delete(c.id);
                              setSelectedClients(next);
                            }}
                          />
                          <span className="text-sm">{c.display_name}</span>
                          <span className="text-xs text-muted-foreground">({c.client_key})</span>
                          {!c.is_active && (
                            <Badge variant="outline" className="text-[10px] ml-auto">inactive</Badge>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
              <p className="text-xs text-muted-foreground mt-2">
                You can leave this empty — they will see “No clients assigned” until access is granted.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            disabled={!selectedUser || submitting}
            onClick={() => selectedUser && onSubmit(selectedUser.id, Array.from(selectedClients))}
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <UserPlus className="h-4 w-4 mr-1" />}
            Grant access
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Phase 4F — Public wrapper. Renders the existing management UI plus a new
 * read-only Audit log sub-tab. Parent (`PlatformSettings`) is unchanged.
 */
export function ImplementersTab() {
  return (
    <Tabs defaultValue="manage" className="w-full">
      <TabsList>
        <TabsTrigger value="manage">Manage</TabsTrigger>
        <TabsTrigger value="audit">Audit log</TabsTrigger>
      </TabsList>
      <TabsContent value="manage" className="pt-4">
        <ImplementersManageTab />
      </TabsContent>
      <TabsContent value="audit" className="pt-4">
        <ImplementersAuditTab />
      </TabsContent>
    </Tabs>
  );
}

// =====================================================================
// Manage clients dialog — add additional clients to an existing implementer
// =====================================================================

function ManageClientsDialog({
  row,
  clients,
  submitting,
  onClose,
  onAssign,
}: {
  row: ImplementerRow;
  clients: Client[];
  submitting: boolean;
  onClose: () => void;
  onAssign: (clientId: string) => void;
}) {
  const assignedIds = new Set(row.assignments.map((a) => a.client_id));
  const available = clients.filter((c) => !assignedIds.has(c.id));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign clients</DialogTitle>
          <DialogDescription>
            Granting access to {row.user.full_name || maskEmail(row.user.email)} for the Implementation Console.
          </DialogDescription>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            All clients are already assigned.
          </p>
        ) : (
          <ScrollArea className="h-64 border rounded-md">
            <ul className="divide-y">
              {available.map((c) => (
                <li
                  key={c.id}
                  className="px-3 py-2 flex items-center justify-between gap-2 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="text-sm truncate">{c.display_name}</div>
                    <div className="text-xs text-muted-foreground">{c.client_key}</div>
                  </div>
                  <Button size="sm" variant="outline" disabled={submitting} onClick={() => onAssign(c.id)}>
                    <Plus className="h-3 w-3 mr-1" /> Assign
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}