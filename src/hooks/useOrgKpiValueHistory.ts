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
  const historyQuery = useQuery({
    queryKey: ['org-kpi-value-history', categoryId, kraName, kpiName, reviewPeriod, reviewYear],
    queryFn: async () => {
      let query = supabase
        .from('org_kpi_value_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (categoryId) query = query.eq('category_id', categoryId);
      if (kraName) query = query.eq('kra_name', kraName);
      if (kpiName) query = query.eq('kpi_name', kpiName);
      if (reviewPeriod) query = query.eq('review_period', reviewPeriod);
      if (reviewYear) query = query.eq('review_year', reviewYear);

      const { data, error } = await query;
      if (error) throw error;
      
      // Fetch profiles via SECURITY DEFINER RPC to bypass RLS
      const userIds = [...new Set((data || []).map(d => d.changed_by).filter(Boolean))] as string[];
      let profileMap = new Map<string, { full_name: string; employee_code: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.rpc('get_profiles_for_audit_display', { p_user_ids: userIds });
        if (profiles) {
          for (const p of profiles) {
            profileMap.set(p.id, { full_name: p.full_name || p.email, employee_code: null });
          }
        }
      }
      
      return (data || []).map(entry => ({
        ...entry,
        changed_by_profile: entry.changed_by ? (profileMap.get(entry.changed_by) || null) : null,
      })) as OrgKpiValueHistoryEntry[];
    },
    enabled: !!categoryId || !!reviewPeriod,
  });

  return historyQuery;
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
