import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface LateJoinerBackfillResult {
  dry_run: boolean;
  processed: number;
  skipped: number;
  details: Array<{
    kpi_id: string;
    employee_id: string;
    okv_id: string;
    achieved_value: number | null;
    computed_score: number | null;
  }>;
}

/**
 * Phase B2 — Late-joiner Org KPI auto-pull backfill.
 * Calls the SECURITY DEFINER RPC `backfill_late_joiner_org_kpis` (admin only).
 * Use dryRun=true to preview impact; dryRun=false to execute.
 */
export function useLateJoinerBackfill() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }): Promise<LateJoinerBackfillResult> => {
      const { data, error } = await supabase.rpc('backfill_late_joiner_org_kpis', {
        p_dry_run: dryRun,
      });
      if (error) throw error;
      return data as unknown as LateJoinerBackfillResult;
    },
    onSuccess: (result) => {
      const verb = result.dry_run ? 'Would auto-pull' : 'Auto-pulled';
      toast({
        title: `${verb} ${result.processed} late-joiner Org KPI(s)`,
        description: `${result.skipped} skipped (no matching propagated value).`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Backfill failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}