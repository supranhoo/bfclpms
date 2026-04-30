import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShieldAlert, Search, UserCheck, UserX } from 'lucide-react';
import { BrandingLoaderPanel } from '@/components/admin/BrandingLoaderPanel';

/**
 * ModuleHubSettings (Admin → Module Hub)
 * --------------------------------------
 * Phase 0 surface for managing the Safety module's visibility:
 *   1. Global kill-switch (modules.is_enabled where code='safety')
 *   2. Per-user grant matrix (safety_module_access)
 *
 * PMS admins are auto-granted via the has_safety_module_access RPC, so
 * the per-user list is for non-admin grantees only.
 */

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
}

interface AccessRow {
  user_id: string;
  can_view: boolean;
  can_edit: boolean;
}

export default function ModuleHubSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const safetyModuleQuery = useQuery({
    queryKey: ['admin', 'safety-module'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('modules')
        .select('id, code, is_enabled')
        .eq('code', 'safety')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['admin', 'safety-module', 'profiles', search],
    queryFn: async () => {
      let q = supabase
        .from('profiles')
        .select('id, full_name, email, employee_code')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .limit(50);
      if (search.trim()) {
        q = q.or(
          `full_name.ilike.%${search}%,email.ilike.%${search}%,employee_code.ilike.%${search}%`
        );
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ProfileRow[];
    },
  });

  const accessQuery = useQuery({
    queryKey: ['admin', 'safety-module-access'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_module_access')
        .select('user_id, can_view, can_edit');
      if (error) throw error;
      return (data || []) as AccessRow[];
    },
  });

  const accessByUser = new Map<string, AccessRow>(
    (accessQuery.data ?? []).map((r) => [r.user_id, r])
  );

  const toggleEnabledMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase
        .from('modules')
        .update({ is_enabled: next })
        .eq('code', 'safety');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'safety-module'] });
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast({ title: 'Updated', description: 'Safety module visibility updated.' });
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: (err as Error).message,
        variant: 'destructive',
      }),
  });

  const grantMutation = useMutation({
    mutationFn: async ({ userId, grant }: { userId: string; grant: boolean }) => {
      if (grant) {
        const { error } = await supabase
          .from('safety_module_access')
          .upsert(
            { user_id: userId, can_view: true, granted_by: user?.id ?? null },
            { onConflict: 'user_id' }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('safety_module_access')
          .delete()
          .eq('user_id', userId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'safety-module-access'] });
      queryClient.invalidateQueries({ queryKey: ['modules'] });
    },
    onError: (err) =>
      toast({
        title: 'Update failed',
        description: (err as Error).message,
        variant: 'destructive',
      }),
  });

  const isEnabled = safetyModuleQuery.data?.is_enabled ?? false;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Module Hub Settings"
        description="Control which modules appear on the Hub and who can access them."
      />

      <BrandingLoaderPanel />

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <CardTitle>Safety</CardTitle>
              <CardDescription>
                Global kill-switch for the Safety module. When OFF, no user sees the
                Safety card on the Hub regardless of per-user grants.
              </CardDescription>
            </div>
            {safetyModuleQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : (
              <div className="flex items-center gap-3">
                <Label htmlFor="safety-enabled" className="text-sm">
                  {isEnabled ? 'Enabled' : 'Disabled'}
                </Label>
                <Switch
                  id="safety-enabled"
                  checked={isEnabled}
                  disabled={toggleEnabledMutation.isPending}
                  onCheckedChange={(v) => toggleEnabledMutation.mutate(v)}
                />
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-user Safety access</CardTitle>
          <CardDescription>
            Grant Safety access to specific users. PMS admins are automatically
            granted and do not need an explicit grant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or employee code"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="border rounded-lg divide-y">
            {profilesQuery.isLoading ? (
              <div className="p-6 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (profilesQuery.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No users match your search.
              </div>
            ) : (
              (profilesQuery.data ?? []).map((p) => {
                const granted = accessByUser.has(p.id);
                return (
                  <div
                    key={p.id}
                    className="p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {p.full_name || p.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {p.email}
                        {p.employee_code ? ` · ${p.employee_code}` : ''}
                      </p>
                    </div>
                    {granted ? (
                      <Badge variant="secondary" className="gap-1">
                        <UserCheck className="h-3 w-3" />
                        Granted
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant={granted ? 'outline' : 'default'}
                      disabled={grantMutation.isPending}
                      onClick={() =>
                        grantMutation.mutate({ userId: p.id, grant: !granted })
                      }
                    >
                      {granted ? (
                        <>
                          <UserX className="h-4 w-4 mr-1" />
                          Revoke
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-4 w-4 mr-1" />
                          Grant
                        </>
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}