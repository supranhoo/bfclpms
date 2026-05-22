import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Flag, Save, Users, ShieldCheck, X } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'employee', label: 'Employee' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'management', label: 'Management' },
  { value: 'hr_pms', label: 'HR PMS' },
  { value: 'skip_level', label: 'Skip-Level' },
];

interface FeatureFlag {
  key: string;
  description: string | null;
  value: boolean;
  target_roles: AppRole[];
  target_user_ids: string[];
  updated_at: string;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  employee_code: string | null;
}

function useFeatureFlags() {
  return useQuery({
    queryKey: ['admin_feature_flags', 'all'],
    queryFn: async (): Promise<FeatureFlag[]> => {
      const { data, error } = await supabase
        .from('admin_feature_flags' as any)
        .select('key, description, value, target_roles, target_user_ids, updated_at')
        .order('key');
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        key: r.key,
        description: r.description,
        value: typeof r.value === 'boolean' ? r.value : r.value === 'true',
        target_roles: (r.target_roles ?? []) as AppRole[],
        target_user_ids: (r.target_user_ids ?? []) as string[],
        updated_at: r.updated_at,
      }));
    },
    staleTime: 30_000,
  });
}

function useTargetedProfiles(ids: string[]) {
  return useQuery({
    queryKey: ['profiles_by_ids', ids.slice().sort().join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .in('id', ids);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });
}

function useProfileSearch(query: string) {
  return useQuery({
    queryKey: ['profile_search_flags', query],
    enabled: query.trim().length >= 2,
    queryFn: async (): Promise<ProfileLite[]> => {
      const q = `%${query.trim()}%`;
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .eq('is_active', true)
        .or(`full_name.ilike.${q},employee_code.ilike.${q}`)
        .limit(25);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
    staleTime: 30_000,
  });
}

function FlagCard({ flag }: { flag: FeatureFlag }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(flag.value);
  const [roles, setRoles] = useState<AppRole[]>(flag.target_roles);
  const [userIds, setUserIds] = useState<string[]>(flag.target_user_ids);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setValue(flag.value);
    setRoles(flag.target_roles);
    setUserIds(flag.target_user_ids);
  }, [flag.key, flag.value, flag.target_roles, flag.target_user_ids]);

  const targetedProfiles = useTargetedProfiles(userIds);
  const searchResults = useProfileSearch(searchQuery);

  const dirty = useMemo(() => {
    const rolesChanged =
      roles.length !== flag.target_roles.length ||
      roles.some((r) => !flag.target_roles.includes(r));
    const usersChanged =
      userIds.length !== flag.target_user_ids.length ||
      userIds.some((u) => !flag.target_user_ids.includes(u));
    return value !== flag.value || rolesChanged || usersChanged;
  }, [value, roles, userIds, flag]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('admin_feature_flags' as any)
        .update({
          value: value as any,
          target_roles: roles,
          target_user_ids: userIds,
        })
        .eq('key', flag.key);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Feature flag updated');
      qc.invalidateQueries({ queryKey: ['admin_feature_flags'] });
      qc.invalidateQueries({ queryKey: ['admin_feature_flag'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to save flag'),
  });

  const audience =
    !value
      ? 'Disabled for everyone'
      : roles.length === 0 && userIds.length === 0
      ? 'Enabled for everyone'
      : `Enabled for ${roles.length} role(s) and ${userIds.length} user(s) (+ all admins)`;

  const addUser = (p: ProfileLite) => {
    if (!userIds.includes(p.id)) setUserIds([...userIds, p.id]);
    setSearchQuery('');
    setSearchOpen(false);
  };

  const removeUser = (id: string) => setUserIds(userIds.filter((u) => u !== id));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base font-mono">
              <Flag className="h-4 w-4 text-primary" />
              {flag.key}
            </CardTitle>
            {flag.description && (
              <CardDescription>{flag.description}</CardDescription>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Label htmlFor={`flag-${flag.key}`} className="text-sm">
              {value ? 'ON' : 'OFF'}
            </Label>
            <Switch
              id={`flag-${flag.key}`}
              checked={value}
              onCheckedChange={setValue}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" />
          <span>{audience}</span>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Target roles
          </Label>
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            value={roles}
            onValueChange={(v) => setRoles(v as AppRole[])}
            className="flex flex-wrap justify-start gap-1"
            disabled={!value}
          >
            {ROLE_OPTIONS.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value} className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Leave all unchecked to apply to every role (subject to the user list below).
          </p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Target specific users
          </Label>
          <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
            {userIds.length === 0 && (
              <span className="text-xs text-muted-foreground italic">No specific users — applies based on roles above.</span>
            )}
            {userIds.map((id) => {
              const p = targetedProfiles.data?.find((x) => x.id === id);
              const label = p
                ? `${p.full_name ?? 'Unnamed'}${p.employee_code ? ` (${p.employee_code})` : ''}`
                : id.slice(0, 8);
              return (
                <Badge key={id} variant="secondary" className="gap-1 pr-1">
                  {label}
                  <button
                    type="button"
                    onClick={() => removeUser(id)}
                    className="rounded hover:bg-muted-foreground/20 p-0.5"
                    disabled={!value}
                    aria-label={`Remove ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" disabled={!value}>
                + Add user
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search by name or employee code…"
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {searchQuery.trim().length < 2 ? (
                    <CommandEmpty>Type at least 2 characters…</CommandEmpty>
                  ) : searchResults.isLoading ? (
                    <CommandEmpty>Searching…</CommandEmpty>
                  ) : (searchResults.data?.length ?? 0) === 0 ? (
                    <CommandEmpty>No matches</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {searchResults.data!.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={p.id}
                          onSelect={() => addUser(p)}
                          disabled={userIds.includes(p.id)}
                        >
                          <div className="flex flex-col">
                            <span>{p.full_name ?? 'Unnamed'}</span>
                            {p.employee_code && (
                              <span className="text-xs text-muted-foreground">{p.employee_code}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} size="sm">
            <Save className="h-4 w-4 mr-1.5" />
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function FeatureFlagsTab() {
  const flags = useFeatureFlags();

  if (flags.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (flags.isError) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-destructive">
          Failed to load feature flags: {(flags.error as any)?.message ?? 'unknown error'}
        </CardContent>
      </Card>
    );
  }

  const rows = flags.data ?? [];
  return (
    <div className="space-y-4">
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5" /> Feature Flags & Gradual Rollout
          </CardTitle>
          <CardDescription>
            Master switch + per-role and per-user targeting. Admins always bypass targeting when a flag is ON,
            so you can preview before exposing it to others.
          </CardDescription>
        </CardHeader>
      </Card>
      {rows.length === 0 ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">No feature flags registered.</CardContent></Card>
      ) : (
        rows.map((f) => <FlagCard key={f.key} flag={f} />)
      )}
    </div>
  );
}

export default FeatureFlagsTab;