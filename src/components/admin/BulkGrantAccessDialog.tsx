import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { useIacRoles, useLoadMatrixLookups, useApplyMatrixDiff } from '@/hooks/useIac';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Search, ShieldCheck, X, Sparkles, UserPlus, AlertTriangle } from 'lucide-react';
import type { IacMatrixDiff, IacMatrixDiffEntry } from '@/services/iac/types';

export interface BulkGrantTarget {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Pre-selected users from the table row checkboxes. */
  initialUsers: BulkGrantTarget[];
  /** Full active-employee pool — used by the inline "Add more" picker. */
  pool: BulkGrantTarget[];
  onCompleted?: () => void;
}

/**
 * Bulk Grant Access — pick many employees × many IAC roles in one shot.
 * Reuses the IAC matrix apply path (same audit row, same batching) so this
 * dialog adds zero new server contract.
 */
export function BulkGrantAccessDialog({
  open,
  onOpenChange,
  initialUsers,
  pool,
  onCompleted,
}: Props) {
  const { toast } = useToast();
  const rolesQuery = useIacRoles();
  const loadLookups = useLoadMatrixLookups();
  const apply = useApplyMatrixDiff();

  const [selectedUsers, setSelectedUsers] = useState<BulkGrantTarget[]>([]);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [includeInactive, setIncludeInactive] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedUsers(initialUsers);
      setSelectedRoleIds(new Set());
      setIncludeInactive(false);
      setAddSearch('');
      setShowPicker(initialUsers.length === 0);
    }
  }, [open, initialUsers]);

  const rolesByModule = useMemo(() => {
    const groups = new Map<string, { id: string; code: string; name: string }[]>();
    (rolesQuery.data ?? [])
      .filter((r) => r.is_active)
      .forEach((r) => {
        const arr = groups.get(r.module) ?? [];
        arr.push({ id: r.id, code: r.code, name: r.name });
        groups.set(r.module, arr);
      });
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rolesQuery.data]);

  const effectiveUsers = useMemo(
    () => selectedUsers.filter((u) => includeInactive || u.is_active),
    [selectedUsers, includeInactive],
  );

  const blockedInactiveCount = useMemo(
    () => selectedUsers.filter((u) => !u.is_active).length,
    [selectedUsers],
  );

  const hasSafetyRoleSelected = useMemo(() => {
    if (!rolesQuery.data) return false;
    return rolesQuery.data.some(
      (r) => selectedRoleIds.has(r.id) && r.module.toLowerCase().includes('safety'),
    );
  }, [rolesQuery.data, selectedRoleIds]);

  const totalPairs = effectiveUsers.length * selectedRoleIds.size;

  // Pool filtered for picker
  const pickerResults = useMemo(() => {
    const taken = new Set(selectedUsers.map((u) => u.id));
    const q = addSearch.trim().toLowerCase();
    return pool
      .filter((u) => !taken.has(u.id))
      .filter((u) =>
        !q ||
        (u.full_name ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employee_code ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [pool, selectedUsers, addSearch]);

  const toggleRole = (id: string) => {
    setSelectedRoleIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const removeUser = (id: string) =>
    setSelectedUsers((prev) => prev.filter((u) => u.id !== id));

  const addUser = (u: BulkGrantTarget) =>
    setSelectedUsers((prev) => (prev.some((p) => p.id === u.id) ? prev : [...prev, u]));

  const handleApply = async () => {
    if (effectiveUsers.length === 0 || selectedRoleIds.size === 0) {
      toast({
        title: 'Nothing to grant',
        description: 'Pick at least one user and one role.',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Resolve current global assignments to compute toGrant only (skip dupes).
      const lookups = await loadLookups.mutateAsync();
      const rolesAll = rolesQuery.data ?? [];
      const roleMeta = new Map(rolesAll.map((r) => [r.id, r]));

      const toGrant: IacMatrixDiffEntry[] = [];
      let alreadyHas = 0;
      for (const u of effectiveUsers) {
        const owned = lookups.currentGlobal.get(u.id) ?? new Map<string, string>();
        for (const roleId of selectedRoleIds) {
          const meta = roleMeta.get(roleId);
          if (!meta) continue;
          if (owned.has(meta.code)) {
            alreadyHas++;
            continue;
          }
          toGrant.push({
            user_id: u.id,
            email: u.email,
            full_name: u.full_name,
            role_id: roleId,
            role_code: meta.code,
          });
        }
      }

      const diff: IacMatrixDiff = {
        toGrant,
        toRevoke: [],
        unchanged: alreadyHas,
        errors: [],
        unknownRoleColumns: [],
      };

      const res = await apply.mutateAsync({ diff, fileName: 'bulk-grant-access-dialog' });

      toast({
        title: 'Access granted',
        description: `Granted ${res.inserted} new role assignment${res.inserted === 1 ? '' : 's'}${
          alreadyHas ? `, skipped ${alreadyHas} already-held` : ''
        }${res.failures.length ? `, ${res.failures.length} batch failure(s)` : ''}.`,
      });

      if (res.failures.length === 0) {
        onOpenChange(false);
        onCompleted?.();
      }
    } catch (err) {
      toast({
        title: 'Bulk grant failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const isApplying = loadLookups.isPending || apply.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Bulk Grant Access
          </DialogTitle>
          <DialogDescription>
            Grant one or more roles to many employees in a single action. Existing role
            assignments are detected and skipped automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Users section */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Selected employees{' '}
                <span className="text-muted-foreground font-normal">
                  ({selectedUsers.length}
                  {blockedInactiveCount > 0 && !includeInactive
                    ? ` · ${blockedInactiveCount} inactive will be skipped`
                    : ''}
                  )
                </span>
              </Label>
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => setShowPicker((v) => !v)}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1" />
                {showPicker ? 'Done' : 'Add more'}
              </Button>
            </div>

            {selectedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
                No users selected. Use <strong>Add more</strong> to pick employees.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 border rounded-md p-2 max-h-32 overflow-y-auto bg-muted/20">
                {selectedUsers.map((u) => (
                  <Badge
                    key={u.id}
                    variant={u.is_active ? 'secondary' : 'outline'}
                    className={`gap-1 ${!u.is_active ? 'opacity-60' : ''}`}
                  >
                    <span className="truncate max-w-[200px]">
                      {u.full_name || u.email}
                      {u.employee_code ? ` · ${u.employee_code}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeUser(u.id)}
                      className="hover:text-destructive"
                      aria-label={`Remove ${u.full_name ?? u.email}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {showPicker && (
              <div className="border rounded-md p-2 space-y-2 bg-background">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search by name, email or employee code"
                    className="pl-8 h-9"
                  />
                </div>
                <ScrollArea className="h-48">
                  <div className="divide-y">
                    {pickerResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground p-2">No matches.</p>
                    ) : (
                      pickerResults.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => addUser(u)}
                          className="w-full text-left p-2 text-sm hover:bg-accent rounded-sm"
                        >
                          <div className="font-medium truncate">
                            {u.full_name || u.email}
                            {!u.is_active && (
                              <Badge variant="outline" className="ml-2 text-[10px]">
                                inactive
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.email}
                            {u.employee_code ? ` · ${u.employee_code}` : ''}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {blockedInactiveCount > 0 && (
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={includeInactive}
                  onCheckedChange={(v) => setIncludeInactive(Boolean(v))}
                />
                Include {blockedInactiveCount} inactive user
                {blockedInactiveCount === 1 ? '' : 's'} in this grant
              </label>
            )}
          </section>

          <Separator />

          {/* Roles section */}
          <section className="space-y-3">
            <Label className="text-sm font-medium">
              Roles to grant{' '}
              <span className="text-muted-foreground font-normal">
                ({selectedRoleIds.size} selected)
              </span>
            </Label>

            {rolesQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rolesByModule.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active roles available. Define roles in the Identity & Access Console first.
              </p>
            ) : (
              <div className="space-y-3">
                {rolesByModule.map(([module, roles]) => (
                  <div key={module} className="border rounded-md p-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {module}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {roles.map((r) => {
                        const checked = selectedRoleIds.has(r.id);
                        return (
                          <label
                            key={r.id}
                            className={`flex items-start gap-2 p-2 rounded-md cursor-pointer border transition-colors ${
                              checked
                                ? 'border-primary bg-primary/5'
                                : 'border-transparent hover:bg-accent'
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleRole(r.id)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{r.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {r.code}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hasSafetyRoleSelected && (
              <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                Granting a Safety role automatically unlocks the Safety Hub tile for these
                users.
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="border-t pt-4 mt-2 flex-col sm:flex-row gap-2 sm:gap-0">
          <div className="flex-1 flex items-center text-sm text-muted-foreground gap-2">
            {totalPairs > 0 ? (
              <>
                <span>
                  Will attempt <strong>{totalPairs}</strong> grant
                  {totalPairs === 1 ? '' : 's'} ({effectiveUsers.length} user
                  {effectiveUsers.length === 1 ? '' : 's'} × {selectedRoleIds.size} role
                  {selectedRoleIds.size === 1 ? '' : 's'}). Existing assignments are skipped.
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                Pick at least one user and one role.
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isApplying}
            >
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={totalPairs === 0 || isApplying}>
              {isApplying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              Grant access
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}