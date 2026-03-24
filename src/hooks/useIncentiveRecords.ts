import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useIncentiveRecords(reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['incentive-records', reviewPeriod, reviewYear],
    enabled: !!reviewPeriod && !!reviewYear,
    queryFn: async () => {
      let query = supabase
        .from('employee_incentive_records')
        .select('*, profiles:employee_id(full_name, employee_code, department_id, designation, departments(name)), incentive_slabs:matched_slab_id(min_value, max_value, incentive_percent, rating_label)')
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!)
        .order('final_incentive_percent', { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data;
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
