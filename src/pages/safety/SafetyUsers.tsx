import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Shield, UserPlus, Trash2, ChevronsUpDown, RotateCcw } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  ALL_SAFETY_ROLES,
  SAFETY_ROLE_LABEL,
  SAFETY_ROLE_DESCRIPTION,
  type SafetyAppRole,
} from '@/lib/safetyRoles';
import {
  useAllSafetyUserRoles,
  useGrantSafetyRole,
  useRevokeSafetyRole,
} from '@/hooks/useSafetyRoles';

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
}

/**
 * SafetyUsers — /safety/settings/users
 * ------------------------------------
 * Phase 1.A admin surface for assigning Safety roles. Lives inside the
 * Safety shell so PMS chrome never shows. RLS enforces that only Safety
 * admins can mutate; non-admins viewing this page see an empty list and
 * the grant form will fail server-side.
 */
export default function SafetyUsers() {
  const { toast } = useToast();
  // Phase 19.1 — split draft (input) and applied (query key) so search
  // fires ONLY when the user clicks Search / presses Enter / picks a row.
  const [draftSearch, setDraftSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<SafetyAppRole>('worker');
  const [pickerOpen, setPickerOpen] = useState(false);

  const profilesQuery = useQuery({
    queryKey: ['safety', 'profiles', appliedSearch],
    // Only fetch when the picker is open AND the user has actually applied
    // a search term. Prevents auto-fetch on keystroke and avoids loading
    // the full 50-user list on page open.
    enabled: pickerOpen,
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .limit(50);
      const term = appliedSearch.trim();
      if (term) {
        q = q.or(
          `full_name.ilike.%${term}%,email.ilike.%${term}%,employee_code.ilike.%${term}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const rolesQuery = useAllSafetyUserRoles();
  const grant = useGrantSafetyRole();
  const revoke = useRevokeSafetyRole();

  const profilesById = useMemo(() => {
    const m = new Map<string, ProfileRow>();
    (profilesQuery.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [profilesQuery.data]);

  // Names lookup for the "Current assignments" list — independent of search box.
  // The search-scoped profilesQuery above is capped at 50 and filtered, so we
  // resolve assigned user_ids separately to avoid showing raw UUIDs.
  const assignedUserIds = useMemo(() => {
    const ids = new Set<string>();
    (rolesQuery.data ?? []).forEach((r) => ids.add(r.user_id));
    return Array.from(ids).sort();
  }, [rolesQuery.data]);

  const assignedProfilesQuery = useQuery({
    queryKey: ['safety', 'assigned-profiles', assignedUserIds.join(',')],
    enabled: assignedUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .in('id', assignedUserIds);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const assignedProfilesById = useMemo(() => {
    const m = new Map<string, ProfileRow>();
    (assignedProfilesQuery.data ?? []).forEach((p) => m.set(p.id, p));
    return m;
  }, [assignedProfilesQuery.data]);

  const selectedProfile =
    profilesById.get(selectedUserId) ?? assignedProfilesById.get(selectedUserId) ?? null;

  const applySearch = () => setAppliedSearch(draftSearch);
  const resetSearch = () => {
    setDraftSearch('');
    setAppliedSearch('');
  };

  const handleGrant = async () => {
    if (!selectedUserId) {
      toast({ title: 'Select a user', variant: 'destructive' });
      return;
    }
    try {
      const res = await grant.mutateAsync({ user_id: selectedUserId, role: selectedRole });
      toast({
        title: 'Role granted',
        description:
          res.auth_action === 'created'
            ? `${SAFETY_ROLE_LABEL[selectedRole]} assigned. Login was provisioned — user must reset their password on first sign-in.`
            : `${SAFETY_ROLE_LABEL[selectedRole]} assigned.`,
      });
      setSelectedUserId('');
    } catch (err) {
      toast({
        title: 'Grant failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      toast({ title: 'Role revoked' });
    } catch (err) {
      toast({
        title: 'Revoke failed',
        description: (err as Error).message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="rounded-md border bg-primary/5 px-4 py-3 flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-primary mt-0.5" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-medium">Now part of the unified Identity & Access Console</p>
          <p className="text-muted-foreground">
            Manage Safety roles alongside PMS and future modules in one place. This page remains for module-scoped grants.
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/iac">Open Console</Link>
        </Button>
      </div>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Safety Users & Roles</h1>
          <p className="text-sm text-muted-foreground">
            Assign Safety-module roles. Granting any role automatically gives Hub access.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grant a role</CardTitle>
          <CardDescription>
            Pick a user and a role. Scope (BU/Department) lands in Phase 1.B alongside the
            incident schema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="safety-user-search">User</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="safety-user-search"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={pickerOpen}
                    className="w-full justify-between h-10"
                  >
                    <span className="truncate text-left">
                      {selectedProfile
                        ? `${selectedProfile.full_name || selectedProfile.email}${
                            selectedProfile.employee_code
                              ? ` · ${selectedProfile.employee_code}`
                              : ''
                          }`
                        : 'Select a user…'}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="p-0 w-[--radix-popover-trigger-width] min-w-[280px]"
                  align="start"
                  // Esc + outside click close the popover natively.
                >
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type employee ID, name, or email…"
                      value={draftSearch}
                      onValueChange={setDraftSearch}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applySearch();
                        }
                      }}
                    />
                    <div className="flex items-center gap-2 border-b px-2 py-2">
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1 h-8"
                        onClick={applySearch}
                        disabled={profilesQuery.isFetching}
                      >
                        {profilesQuery.isFetching ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Search className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Search
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={resetSearch}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        Reset
                      </Button>
                    </div>
                    <CommandList className="max-h-64">
                      {!appliedSearch && !profilesQuery.isFetching ? (
                        <div className="p-4 text-xs text-center text-muted-foreground">
                          Enter a name, email or employee ID, then tap Search.
                        </div>
                      ) : profilesQuery.isLoading || profilesQuery.isFetching ? (
                        <div className="p-6 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>No users match.</CommandEmpty>
                          <CommandGroup>
                            {(profilesQuery.data ?? []).map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.id}
                                onSelect={() => {
                                  setSelectedUserId(p.id);
                                  setPickerOpen(false);
                                }}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="font-medium truncate">
                                    {p.full_name || p.email}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {p.email}
                                    {p.employee_code ? ` · ${p.employee_code}` : ''}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedProfile && (
                <p className="text-xs text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{selectedProfile.full_name || selectedProfile.email}</span>
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="safety-role">Role</Label>
              <Select
                value={selectedRole}
                onValueChange={(v) => setSelectedRole(v as SafetyAppRole)}
              >
                <SelectTrigger id="safety-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ALL_SAFETY_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {SAFETY_ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SAFETY_ROLE_DESCRIPTION[selectedRole]}
              </p>
              <Button
                className="w-full"
                onClick={handleGrant}
                disabled={!selectedUserId || grant.isPending}
              >
                {grant.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Grant role
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Safety role assignments</CardTitle>
          <CardDescription>
            All Safety role grants visible to you. Revoke removes Hub access if it was the
            user's only Safety role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rolesQuery.isLoading ? (
            <div className="p-6 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (rolesQuery.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No Safety roles assigned yet.
            </div>
          ) : (
            <div className="border rounded-md divide-y">
              {(rolesQuery.data ?? []).map((row) => {
                const profile =
                  assignedProfilesById.get(row.user_id) ?? profilesById.get(row.user_id);
                return (
                  <div
                    key={row.id}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {profile?.full_name || profile?.email || row.user_id}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {profile?.email ?? ''}
                        {profile?.employee_code ? ` · ${profile.employee_code}` : ''}
                        {profile ? ' · ' : ''}
                        Granted {new Date(row.assigned_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="secondary">{SAFETY_ROLE_LABEL[row.role]}</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevoke(row.id)}
                      disabled={revoke.isPending}
                      aria-label="Revoke role"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
