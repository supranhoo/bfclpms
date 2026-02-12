import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgKpiValueHistoryEntry {
  id: string;
  org_kpi_value_id: string;
  category_id: string;
  kra_name: string;
  kpi_name: string;
  review_period: string;
  review_year: number;
  old_achieved_value: number | null;
  new_achieved_value: number | null;
  old_status: string | null;
  new_status: string | null;
  changed_by: string | null;
  change_type: string;
  propagated_count: number;
  metadata: any;
  created_at: string;
  // Joined
  changed_by_profile?: { full_name: string; employee_code: string | null } | null;
}

export function useOrgKpiValueHistory(
  categoryId?: string,
  kraName?: string,
  kpiName?: string,
  reviewPeriod?: string,
  reviewYear?: number
) {
  return useQuery({
    queryKey: ['org-kpi-value-history', categoryId, kraName, kpiName, reviewPeriod, reviewYear],
    queryFn: async () => {
      let query = supabase
        .from('org_kpi_value_history')
        .select(`
          *,
          changed_by_profile:profiles!org_kpi_value_history_changed_by_fkey(full_name, employee_code)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (categoryId) query = query.eq('category_id', categoryId);
      if (kraName) query = query.eq('kra_name', kraName);
      if (kpiName) query = query.eq('kpi_name', kpiName);
      if (reviewPeriod) query = query.eq('review_period', reviewPeriod);
      if (reviewYear) query = query.eq('review_year', reviewYear);

      const { data, error } = await query;
      if (error) throw error;
      return data as OrgKpiValueHistoryEntry[];
    },
    enabled: !!categoryId || !!reviewPeriod,
  });
}

export function useInsertOrgKpiValueHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: {
      org_kpi_value_id: string;
      category_id: string;
      kra_name: string;
      kpi_name: string;
      review_period: string;
      review_year: number;
      old_achieved_value?: number | null;
      new_achieved_value?: number | null;
      old_status?: string | null;
      new_status?: string | null;
      changed_by?: string | null;
      change_type: string;
      propagated_count?: number;
      metadata?: any;
    }) => {
      const { error } = await supabase
        .from('org_kpi_value_history')
        .insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-value-history'] });
    },
  });
}
