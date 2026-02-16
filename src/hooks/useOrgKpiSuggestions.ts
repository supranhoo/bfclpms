import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgKpiSuggestion {
  kra_name: string;
  kpi_name: string;
  category_id: string;
  category_name: string;
  employee_count: number;
  already_org_level: boolean;
}

export function useOrgKpiSuggestions(reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['org-kpi-suggestions', reviewPeriod, reviewYear],
    queryFn: async () => {
      // Get all non-org KPIs for this period
      const { data: nonOrgKpis, error: err1 } = await supabase
        .from('kpis')
        .select('kra_name, kpi_name, category_id, employee_id')
        .eq('is_org_level', false)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!);

      if (err1) throw err1;

      // Get existing org-level KPIs to check "already marked"
      const { data: orgKpis, error: err2 } = await supabase
        .from('kpis')
        .select('kra_name, kpi_name')
        .eq('is_org_level', true)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!);

      if (err2) throw err2;

      const orgSet = new Set(orgKpis?.map(k => `${k.kra_name}||${k.kpi_name}`) || []);

      // Get categories
      const { data: cats } = await supabase.from('kra_categories').select('id, name');
      const catMap = new Map(cats?.map(c => [c.id, c.name]) || []);

      // Group by kra_name + kpi_name + category_id, count distinct employees
      const grouped = new Map<string, { kra_name: string; kpi_name: string; category_id: string; employees: Set<string> }>();
      nonOrgKpis?.forEach(k => {
        const key = `${k.category_id}||${k.kra_name}||${k.kpi_name}`;
        const existing = grouped.get(key) || { kra_name: k.kra_name, kpi_name: k.kpi_name, category_id: k.category_id, employees: new Set<string>() };
        existing.employees.add(k.employee_id);
        grouped.set(key, existing);
      });

      // Filter to 3+ employees and build suggestions
      const suggestions: OrgKpiSuggestion[] = [];
      grouped.forEach(g => {
        if (g.employees.size >= 3) {
          suggestions.push({
            kra_name: g.kra_name,
            kpi_name: g.kpi_name,
            category_id: g.category_id,
            category_name: catMap.get(g.category_id) || 'Unknown',
            employee_count: g.employees.size,
            already_org_level: orgSet.has(`${g.kra_name}||${g.kpi_name}`),
          });
        }
      });

      suggestions.sort((a, b) => b.employee_count - a.employee_count);
      return suggestions;
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}
