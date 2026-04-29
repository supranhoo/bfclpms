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
import { Loader2, Search, Shield, UserPlus, Trash2 } from 'lucide-react';
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
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<SafetyAppRole>('worker');

  const profilesQuery = useQuery({
    queryKey: ['safety', 'profiles', search],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .limit(50);
      if (search.trim()) {
        q = q.or(
          `full_name.ilike.%${search}%,email.ilike.%${search}%,employee_code.ilike.%${search}%`,
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

  const handleGrant = async () => {
    if (!selectedUserId) {
      toast({ title: 'Select a user', variant: 'destructive' });
      return;
    }
    try {
      await grant.mutateAsync({ user_id: selectedUserId, role: selectedRole });
      toast({
        title: 'Role granted',
        description: `${SAFETY_ROLE_LABEL[selectedRole]} assigned.`,
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
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="safety-user-search"
                  placeholder="Search by name, email, or employee code"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-md max-h-64 overflow-auto divide-y">
                {profilesQuery.isLoading ? (
                  <div className="p-6 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (profilesQuery.data ?? []).length === 0 ? (
                  <div className="p-4 text-sm text-center text-muted-foreground">
                    No users match.
                  </div>
                ) : (
                  (profilesQuery.data ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedUserId(p.id)}
                      className={`w-full text-left p-2 text-sm hover:bg-accent ${
                        selectedUserId === p.id ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="font-medium truncate">
                        {p.full_name || p.email}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.email}
                        {p.employee_code ? ` · ${p.employee_code}` : ''}
                      </div>
                    </button>
                  ))
                )}
              </div>
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
                const profile = profilesById.get(row.user_id);
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
