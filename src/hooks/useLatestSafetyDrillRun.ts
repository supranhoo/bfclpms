import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SafetyDrillDelta } from './useSafetyDrill';

export interface SafetyDrillRunRow {
  id: string;
  drill_id: string;
  backup_id: string | null;
  ok: boolean;
  started_at: string;
  finished_at: string;
  baseline: Record<string, number>;
  after: Record<string, number>;
  deltas: SafetyDrillDelta[];
  errors: string[] | null;
  performed_by: string | null;
  system_run: boolean;
}

/**
 * Latest persisted Safety backup→restore drill run (manual or scheduled).
 * Restricted by RLS to admin / Safety-head users.
 */
export function useLatestSafetyDrillRun() {
  return useQuery<SafetyDrillRunRow | null>({
    queryKey: ['safety-drill-runs', 'latest'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('safety_drill_runs')
        .select('*')
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as unknown as SafetyDrillRunRow | null) ?? null;
    },
    staleTime: 30_000,
  });
}