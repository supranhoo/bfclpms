import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LockedResponseRow {
  role: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  submitted_at: string | null;
}

/**
 * ADR-160b — Impact preview support: list locked responses for an instance so
 * the "Edit workflow & reviewers" dialog can show what will be archived.
 */
export function useInstanceLockedResponses(instanceId: string | null | undefined) {
  return useQuery({
    queryKey: ['ar', 'locked-responses', instanceId],
    enabled: !!instanceId,
    staleTime: 30_000,
    queryFn: async (): Promise<LockedResponseRow[]> => {
      const { data, error } = await supabase
        .from('annual_review_responses')
        .select('reviewer_role, reviewer_id, submitted_at, profiles:reviewer_id(full_name)')
        .eq('instance_id', instanceId as string)
        .eq('is_locked', true);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        role: r.reviewer_role,
        reviewer_id: r.reviewer_id,
        reviewer_name: r.profiles?.full_name ?? null,
        submitted_at: r.submitted_at,
      }));
    },
  });
}