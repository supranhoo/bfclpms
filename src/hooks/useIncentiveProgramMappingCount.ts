import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Counts active employee mappings for a given incentive program.
 * Used by the report empty-state to surface a friendly "Compute Now" CTA.
 */
export function useIncentiveProgramMappingCount(programId?: string) {
  const enabled = !!programId && programId !== 'all';
  return useQuery({
    queryKey: ['incentive-program-mapping-count', programId],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_program_mappings')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', programId!);
      if (error) throw error;
      return count || 0;
    },
  });
}
