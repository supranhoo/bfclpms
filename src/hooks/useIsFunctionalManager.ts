import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * True iff the current user is referenced as `functional_manager_id` on at
 * least one active profile. "Functional Manager" is a relationship — not an
 * app_role — so this hook drives whether the Bulk Review reviewer-stage
 * dropdown should expose the Functional Manager option to a `manager` user.
 */
export function useIsFunctionalManager(): boolean {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ['is-functional-manager', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('functional_manager_id', user.id)
        .eq('is_active', true)
        .limit(1);
      if (error) return false;
      return (count ?? 0) > 0;
    },
    // ADR-193 — Functional Manager is a relationship, not a role: any active
    // user may be one, so the probe must not be role-gated.
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });

  return !!data;
}