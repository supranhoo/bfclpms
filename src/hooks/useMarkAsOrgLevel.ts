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
        .update({ is_org_level: true, org_level_scope: params.scope || 'organization' })
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
      queryClient.invalidateQueries({ queryKey: ['org-kpi-suggestions'] });
    },
  });

  const markBulk = useMutation({
    mutationFn: async (items: MarkOrgLevelParams[]) => {
      let totalAffected = 0;
      for (const params of items) {
        let query = supabase
          .from('kpis')
          .update({ is_org_level: true, org_level_scope: params.scope || 'organization' })
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
      queryClient.invalidateQueries({ queryKey: ['org-kpi-suggestions'] });
    },
  });

  return { markSingle, markBulk };
}
