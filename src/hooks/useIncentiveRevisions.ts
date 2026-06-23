import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useIncentiveRevisions(filters?: { affectedPeriod?: string; affectedYear?: number; slabChangeOnly?: boolean }) {
  return useQuery({
    queryKey: ['incentive-revisions', filters],
    queryFn: async () => {
      let query = supabase
        .from('incentive_score_revisions')
        .select('*, profiles:employee_id(full_name, employee_code, department_id, departments!profiles_department_fk(name))')
        .order('created_at', { ascending: false });

      if (filters?.affectedPeriod) query = query.eq('affected_period', filters.affectedPeriod);
      if (filters?.affectedYear) query = query.eq('affected_year', filters.affectedYear);
      if (filters?.slabChangeOnly) query = query.neq('original_slab_percent', null as any);

      const { data, error } = await query;
      if (error) throw error;

      if (filters?.slabChangeOnly && data) {
        return data.filter((r: any) => r.original_slab_percent !== r.revised_slab_percent);
      }
      return data;
    },
  });
}

export function useMarkPayrollNotified() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('incentive_score_revisions')
        .update({ is_payroll_notified: true, notified_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-revisions'] });
      qc.invalidateQueries({ queryKey: ['incentive-pending-adjustments-count'] });
      toast({ title: 'Marked as notified' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
