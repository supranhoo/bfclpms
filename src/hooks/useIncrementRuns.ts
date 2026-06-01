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
  manually_edited?: boolean | null;
  edited_by?: string | null;
  edited_at?: string | null;
  // Confirmation Increment Adjustment traceability (RCA: transition gate).
  confirmation_treatment?: string | null;
  confirmation_granted?: boolean | null;
  confirmation_effective_date?: string | null;
  period_covered_months?: number | null;
  balance_eligible_months?: number | null;
  carry_forward_months?: number | null;
  final_eligible_months?: number | null;
  adjustment_reason?: string | null;
  transition_key?: string | null;
  pre_confirmation_status?: string | null;
  transition_source?: 'history' | 'profile_snapshot' | 'none' | null;
  evidence_urls?: string[] | null;
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
          '*, employee:profiles!increment_run_items_employee_id_fkey(id, full_name, employee_code, group_doj)',
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
      employee_ids,
    }: {
      assessment_year: string;
      employee_id?: string | null;
      employee_ids?: string[] | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('compute-increment', {
        body: {
          assessment_year,
          employee_id: employee_id ?? null,
          employee_ids: employee_ids ?? null,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-runs', vars.assessment_year] });
      qc.invalidateQueries({ queryKey: ['latest-increment-results', vars.assessment_year] });
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
            '*, employee:profiles!increment_run_items_employee_id_fkey(id, full_name, employee_code, group_doj)',
          )
          .eq('run_id', runId)
          .order('created_at', { ascending: true })
          .range(from, to),
      );
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Latest Calculations: one latest row per employee for the AY.
// ─────────────────────────────────────────────────────────────────────
export function useLatestIncrementResults(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['latest-increment-results', assessmentYear],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const { data: runs, error: runsErr } = await supabase
        .from('increment_runs' as any)
        .select('id, triggered_at')
        .eq('assessment_year', assessmentYear!)
        .order('triggered_at', { ascending: false });
      if (runsErr) throw runsErr;
      const runList = (runs as any[]) ?? [];
      if (!runList.length) return [] as any[];
      const runOrder = new Map<string, number>();
      runList.forEach((r, idx) => runOrder.set(r.id, idx)); // 0 = newest
      const runIds = runList.map((r) => r.id);
      const items = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('increment_run_items' as any)
          .select(
            '*, employee:profiles!increment_run_items_employee_id_fkey(id, full_name, employee_code, group_doj)',
          )
          .in('run_id', runIds)
          .order('created_at', { ascending: false })
          .range(from, to),
      );
      // Keep only the row from the most recent run per employee_id.
      const latestByEmp = new Map<string, any>();
      for (const it of items) {
        const rank = runOrder.get(it.run_id) ?? Number.MAX_SAFE_INTEGER;
        const cur = latestByEmp.get(it.employee_id);
        const curRank = cur ? (runOrder.get(cur.run_id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        if (!cur || rank < curRank) latestByEmp.set(it.employee_id, it);
      }
      return Array.from(latestByEmp.values()).sort((a, b) => {
        const an = a.employee?.full_name ?? '';
        const bn = b.employee?.full_name ?? '';
        return an.localeCompare(bn);
      });
    },
  });
}

const EDITABLE_RUN_ITEM_FIELDS = [
  'eligible_percent',
  'increment_amount',
  'revised_salary',
  'remarks',
  'eligibility_status',
  'evidence_urls',
] as const;

export function useUpdateIncrementRunItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<IncrementRunItemRow, typeof EDITABLE_RUN_ITEM_FIELDS[number]>>;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const safe: any = {};
      for (const k of EDITABLE_RUN_ITEM_FIELDS) {
        if (k in patch) safe[k] = (patch as any)[k];
      }
      safe.manually_edited = true;
      safe.edited_by = userData?.user?.id ?? null;
      safe.edited_at = new Date().toISOString();
      const { data, error } = await supabase
        .from('increment_run_items' as any)
        .update(safe)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['increment-run-items'] });
      qc.invalidateQueries({ queryKey: ['latest-increment-results'] });
      toast({ title: 'Saved', description: 'Result row updated.' });
    },
    onError: (e: any) =>
      toast({ title: 'Save failed', description: e?.message ?? 'Unknown error', variant: 'destructive' }),
  });
}

export function useDeleteIncrementRunItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('increment_run_items' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['increment-run-items'] });
      qc.invalidateQueries({ queryKey: ['latest-increment-results'] });
      toast({ title: 'Deleted', description: 'Result row deleted.' });
    },
    onError: (e: any) =>
      toast({ title: 'Delete failed', description: e?.message ?? 'Unknown error', variant: 'destructive' }),
  });
}

export function useExportLatestIncrementResults(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['latest-increment-results-export', assessmentYear],
    enabled: false,
    queryFn: async () => {
      if (!assessmentYear) return [] as any[];
      const { data: runs, error: runsErr } = await supabase
        .from('increment_runs' as any)
        .select('id, triggered_at')
        .eq('assessment_year', assessmentYear)
        .order('triggered_at', { ascending: false });
      if (runsErr) throw runsErr;
      const runList = (runs as any[]) ?? [];
      if (!runList.length) return [] as any[];
      const runOrder = new Map<string, number>();
      runList.forEach((r, idx) => runOrder.set(r.id, idx));
      const runIds = runList.map((r) => r.id);
      const items = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('increment_run_items' as any)
          .select(
            '*, employee:profiles!increment_run_items_employee_id_fkey(id, full_name, employee_code, group_doj)',
          )
          .in('run_id', runIds)
          .range(from, to),
      );
      const latest = new Map<string, any>();
      for (const it of items) {
        const rank = runOrder.get(it.run_id) ?? Number.MAX_SAFE_INTEGER;
        const cur = latest.get(it.employee_id);
        const curRank = cur ? (runOrder.get(cur.run_id) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
        if (!cur || rank < curRank) latest.set(it.employee_id, it);
      }
      return Array.from(latest.values());
    },
  });
}