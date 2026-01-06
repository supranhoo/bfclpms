import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPI } from '@/hooks/useKpis';

// Hook to get unique org-level KPIs (where is_org_level = true) for a period
export function useOrgLevelKpis(reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['org-level-kpis', reviewPeriod, reviewYear],
    queryFn: async () => {
      let query = supabase
        .from('kpis')
        .select(`
          *,
          kra_categories (id, name, color, weightage)
        `)
        .eq('is_org_level', true)
        .order('category_id')
        .order('kra_name')
        .order('kpi_name');

      if (reviewPeriod) {
        query = query.eq('review_period', reviewPeriod);
      }
      if (reviewYear) {
        query = query.eq('review_year', reviewYear);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Return unique KPI definitions (dedupe by category_id + kra_name + kpi_name)
      const uniqueMap = new Map<string, typeof data[0]>();
      data?.forEach(kpi => {
        const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, kpi);
        }
      });
      
      return Array.from(uniqueMap.values()) as (KPI & { kra_categories: { id: string; name: string; color: string; weightage: number } })[];
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}
