import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TeamQueueScopeAppSettings } from '@/lib/annualReview/teamQueueScopeConfig';

const KEY = ['annual-review', 'team-queue-scope-config'] as const;

export function useTeamQueueScopeSettings() {
  return useQuery<TeamQueueScopeAppSettings | null>({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('team_queue_default_scope, team_queue_allowed_scopes, team_queue_role_overrides, team_queue_allow_user_override')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as TeamQueueScopeAppSettings | null;
    },
    staleTime: 60_000,
  });
}

export function useMyTeamQueueDefault(userId: string | undefined) {
  return useQuery<string | null>({
    queryKey: ['annual-review', 'my-team-queue-default', userId ?? null],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('team_queue_default_scope')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.team_queue_default_scope ?? null) as string | null;
    },
    staleTime: 60_000,
  });
}

export function useSetMyTeamQueueDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scope: string | null) => {
      const { error } = await supabase.rpc('set_my_team_queue_default_scope' as never, {
        p_scope: scope,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annual-review', 'my-team-queue-default'] });
    },
  });
}

export function useUpdateTeamQueueScopeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: TeamQueueScopeAppSettings) => {
      // Fetch the single settings row id first — app_settings has one row.
      const { data: existing, error: readErr } = await supabase
        .from('app_settings')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!existing?.id) throw new Error('app_settings row not found');
      const { error } = await supabase
        .from('app_settings')
        .update(patch as never)
        .eq('id', existing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}