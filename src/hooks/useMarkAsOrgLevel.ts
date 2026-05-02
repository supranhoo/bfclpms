import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface MarkOrgLevelParams {
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  scope?: string;
  categoryIds?: string[]; // if provided, only mark KPIs in these categories
}

export function useMarkAsOrgLevel() {
  const queryClient = useQueryClient();

  const markSingle = useMutation({
    mutationFn: async (params: MarkOrgLevelParams) => {
      let query = supabase
        .from('kpis')
        .update({ is_org_level: true, org_level_scope: params.scope || 'employee' })
        .eq('kra_name', params.kraName)
        .eq('kpi_name', params.kpiName)
        .eq('review_period', params.reviewPeriod)
        .eq('review_year', params.reviewYear);

      if (params.categoryIds && params.categoryIds.length > 0) {
        query = query.in('category_id', params.categoryIds);
      }

      const { data, error, count } = await query.select('id');
      if (error) throw error;
      return { affected: data?.length || 0 };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis-with-employees'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-suggestions'] });
    },
  });

  const markBulk = useMutation({
    mutationFn: async (items: MarkOrgLevelParams[]) => {
      let totalAffected = 0;
      for (const params of items) {
        let query = supabase
          .from('kpis')
          .update({ is_org_level: true, org_level_scope: params.scope || 'employee' })
          .eq('kra_name', params.kraName)
          .eq('kpi_name', params.kpiName)
          .eq('review_period', params.reviewPeriod)
          .eq('review_year', params.reviewYear);

        if (params.categoryIds && params.categoryIds.length > 0) {
          query = query.in('category_id', params.categoryIds);
        }

        const { data, error } = await query.select('id');
        if (error) throw error;
        totalAffected += data?.length || 0;
      }
      return { totalAffected };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis-with-employees'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-suggestions'] });
    },
  });

  return { markSingle, markBulk };
}

interface UnmarkOrgLevelParams {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
}

export function useUnmarkAsOrgLevel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: UnmarkOrgLevelParams) => {
      // 1. Set is_org_level = false on all matching KPI records
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ is_org_level: false, org_level_scope: null })
        .eq('kra_name', params.kraName)
        .eq('kpi_name', params.kpiName)
        .eq('review_period', params.reviewPeriod)
        .eq('review_year', params.reviewYear)
        .eq('is_org_level', true);
      if (kpiError) throw kpiError;

      // 2. Delete org_kpi_values for this KPI+period
      const { error: valError } = await supabase
        .from('org_kpi_values')
        .delete()
        .eq('category_id', params.categoryId)
        .eq('kra_name', params.kraName)
        .eq('kpi_name', params.kpiName)
        .eq('review_period', params.reviewPeriod)
        .eq('review_year', params.reviewYear);
      if (valError) throw valError;

      // 3. Delete data owner assignments
      const { error: ownerError } = await supabase
        .from('org_kpi_data_owners')
        .delete()
        .eq('category_id', params.categoryId)
        .eq('kra_name', params.kraName)
        .eq('kpi_name', params.kpiName);
      if (ownerError) throw ownerError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-kpis-with-employees'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-data-owners'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-suggestions'] });
    },
  });
}
