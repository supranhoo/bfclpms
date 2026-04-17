import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useIncentiveRecords(reviewPeriod?: string, reviewYear?: number, programId?: string) {
  return useQuery({
    queryKey: ['incentive-records', reviewPeriod, reviewYear, programId],
    enabled: !!reviewPeriod && !!reviewYear,
    queryFn: async () => {
      let query = supabase
        .from('employee_incentive_records')
        .select('*, profiles:employee_id(full_name, employee_code, department_id, designation, departments(name)), incentive_slabs:matched_slab_id(min_value, max_value, incentive_percent, rating_label)')
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!)
        .order('final_incentive_percent', { ascending: false });
      if (programId) {
        query = query.eq('program_id', programId);
      }
      const { data, error } = await query;
      if (error) {
        console.error('Incentive records fetch error:', error);
        throw error;
      }
      return data;
    },
  });
}

/**
 * Fetches per-employee KPI completion status for a period.
 * Returns Map<employeeId, { total, approved, allApproved }>
 * "Approved" means kpi.status === 'approved' (the canonical final stage).
 */
export function useEmployeeKpiStatusForPeriod(
  employeeIds: string[],
  reviewPeriod?: string,
  reviewYear?: number,
) {
  const idsKey = employeeIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['employee-kpi-status', reviewPeriod, reviewYear, idsKey, employeeIds.length],
    enabled: !!reviewPeriod && !!reviewYear && employeeIds.length > 0,
    queryFn: async () => {
      const map = new Map<string, { total: number; approved: number; allApproved: boolean }>();
      const BATCH = 200;
      for (let i = 0; i < employeeIds.length; i += BATCH) {
        const batch = employeeIds.slice(i, i + BATCH);
        const { data, error } = await supabase
          .from('kpis')
          .select('employee_id, status')
          .in('employee_id', batch)
          .eq('review_period', reviewPeriod!)
          .eq('review_year', reviewYear!);
        if (error) throw error;
        (data || []).forEach((k: any) => {
          const cur = map.get(k.employee_id) || { total: 0, approved: 0, allApproved: false };
          cur.total += 1;
          if (k.status === 'approved') cur.approved += 1;
          map.set(k.employee_id, cur);
        });
      }
      // Finalize allApproved
      map.forEach((v) => { v.allApproved = v.total > 0 && v.approved === v.total; });
      return map;
    },
  });
}

export function useConfirmIncentiveRecords() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ ids, confirmedBy }: { ids: string[]; confirmedBy: string }) => {
      const { error } = await supabase
        .from('employee_incentive_records')
        .update({ status: 'confirmed', confirmed_by: confirmedBy })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-records'] }); toast({ title: 'Records confirmed' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useMarkIncentivePaid() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('employee_incentive_records')
        .update({ status: 'paid' })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-records'] }); toast({ title: 'Marked as paid' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function usePendingAdjustmentCount() {
  return useQuery({
    queryKey: ['incentive-pending-adjustments-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_score_revisions')
        .select('id', { count: 'exact', head: true })
        .eq('is_payroll_notified', false);
      if (error) throw error;
      return count || 0;
    },
  });
}

export function useComputeIncentives() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: { review_period: string; review_year: number; program_id: string; dry_run?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('compute-monthly-incentives', { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      if (!variables.dry_run) {
        qc.invalidateQueries({ queryKey: ['incentive-records'] });
        toast({ title: 'Incentives computed', description: `${_data.computed} record(s) processed` });
      }
    },
    onError: (e: Error) => toast({ title: 'Computation failed', description: e.message, variant: 'destructive' }),
  });
}

// ── Report Data (batched, no row limit) ──

interface IncentiveReportFilters {
  month: string;
  year: string;
  programId: string;
}

async function fetchAllIncentiveRecords(filters: IncentiveReportFilters) {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('employee_incentive_records')
      .select(`
        *,
        profiles:employee_id(full_name, employee_code, designation, department_id, departments(name, business_units(name, divisions(name)))),
        incentive_slabs:matched_slab_id(min_value, max_value, incentive_percent, rating_label),
        incentive_programs:program_id(name, incentive_base)
      `)
      .range(offset, offset + PAGE_SIZE - 1)
      .order('created_at', { ascending: true });

    if (filters.month !== 'all') query = query.eq('review_period', filters.month);
    if (filters.year !== 'all') query = query.eq('review_year', Number(filters.year));
    if (filters.programId !== 'all') query = query.eq('program_id', filters.programId);

    const { data, error } = await query;
    if (error) throw error;
    allData = [...allData, ...(data || [])];
    hasMore = (data?.length || 0) === PAGE_SIZE;
    offset += PAGE_SIZE;
  }
  return allData;
}

export function useIncentiveReportData(filters: IncentiveReportFilters) {
  return useQuery({
    queryKey: ['incentive-report-data', filters.month, filters.year, filters.programId],
    queryFn: () => fetchAllIncentiveRecords(filters),
    placeholderData: (prev) => prev,
  });
}

export function useDetectRetroactiveChanges() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (body: { review_period: string; review_year: number; program_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('detect-retroactive-incentive-changes', { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['incentive-revisions'] });
      toast({ title: 'Detection complete', description: `${data.revisions_created} revision(s) found` });
    },
    onError: (e: Error) => toast({ title: 'Detection failed', description: e.message, variant: 'destructive' }),
  });
}
