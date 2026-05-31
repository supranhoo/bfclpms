import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchAllPaged } from '@/lib/fetchAll';

export interface IncrementRunRow {
  id: string;
  assessment_year: string;
  scope_snapshot: Record<string, any>;
  triggered_by: string | null;
  triggered_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
  summary: Record<string, any>;
  error_message: string | null;
}

export interface IncrementRunItemRow {
  id: string;
  run_id: string;
  employee_id: string;
  pms_score: number | null;
  rating_band: string | null;
  slab_percent: number | null;
  eligibility_status: 'eligible' | 'ineligible' | 'excluded' | 'no_score';
  criteria_exempt?: boolean | null;
  exemption_reason?: string | null;
  ineligibility_reason: string | null;
  method_used: string | null;
  eligible_percent: number | null;
  service_months: number | null;
  current_salary: number | null;
  increment_amount: number | null;
  revised_salary: number | null;
  remarks: string | null;
  created_at: string;
}

export function useIncrementRuns(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['increment-runs', assessmentYear],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('increment_runs' as any)
        .select('*')
        .eq('assessment_year', assessmentYear!)
        .order('triggered_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data as unknown as IncrementRunRow[]) ?? [];
    },
  });
}

export function useIncrementRunItems(runId: string | null, page = 0, pageSize = 100) {
  return useQuery({
    queryKey: ['increment-run-items', runId, page, pageSize],
    enabled: !!runId,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('increment_run_items' as any)
        .select(
          '*, employee:profiles!increment_run_items_employee_id_fkey(id, full_name, employee_code)',
          { count: 'exact' },
        )
        .eq('run_id', runId!)
        .order('created_at', { ascending: true })
        .range(from, to);
      if (error) throw error;
      return { rows: (data as any[]) ?? [], total: count ?? 0 };
    },
  });
}

export function useTriggerIncrementRun() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      assessment_year,
      employee_id,
    }: { assessment_year: string; employee_id?: string | null }) => {
      const { data, error } = await supabase.functions.invoke('compute-increment', {
        body: { assessment_year, employee_id: employee_id ?? null },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-runs', vars.assessment_year] });
      toast({ title: 'Calculation complete', description: 'Increment run finished.' });
    },
    onError: (e: any) =>
      toast({
        title: 'Calculation failed',
        description: e?.message ?? 'Unknown error',
        variant: 'destructive',
      }),
  });
}

/**
 * Lazy-fetch ALL items for a run (paged), used by the Export Excel button so
 * the export always contains the full run regardless of the currently visible
 * page in the UI. Disabled by default; call `refetch()` on demand.
 */
export function useExportIncrementRunItems(runId: string | null) {
  return useQuery({
    queryKey: ['increment-run-items-export', runId],
    enabled: false,
    queryFn: async () => {
      if (!runId) return [];
      return fetchAllPaged<any>((from, to) =>
        supabase
          .from('increment_run_items' as any)
          .select(
            '*, employee:profiles!increment_run_items_employee_id_fkey(id, full_name, employee_code)',
          )
          .eq('run_id', runId)
          .order('created_at', { ascending: true })
          .range(from, to),
      );
    },
  });
}