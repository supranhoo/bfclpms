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
      
      return Array.from(uniqueMap.values()) as unknown as (KPI & { kra_categories: { id: string; name: string; color: string; weightage: number } })[];
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}

// Hook that filters org-level KPIs to only those with at least 1 employee mapped
// Also returns employeeCount per KPI
export interface OrgLevelKpiWithEmployees {
  kpi: KPI & { kra_categories: { id: string; name: string; color: string; weightage: number } };
  employeeCount: number;
}

export function useOrgLevelKpisWithEmployees(reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['org-level-kpis-with-employees', reviewPeriod, reviewYear],
    queryFn: async () => {
      // 1. Get all org-level KPIs (unique definitions)
      const { data: allOrgKpis, error: err1 } = await supabase
        .from('kpis')
        .select(`*, kra_categories (id, name, color, weightage)`)
        .eq('is_org_level', true)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!)
        .order('category_id')
        .order('kra_name')
        .order('kpi_name');

      if (err1) throw err1;

      // Dedupe
      const uniqueMap = new Map<string, typeof allOrgKpis[0]>();
      allOrgKpis?.forEach(kpi => {
        const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, kpi);
      });

      // 2. Count employees per org KPI (all records with matching names, same period)
      const { data: empCounts, error: err2 } = await supabase
        .from('kpis')
        .select('category_id, kra_name, kpi_name, employee_id')
        .eq('is_org_level', true)
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!);

      if (err2) throw err2;

      const countMap = new Map<string, Set<string>>();
      empCounts?.forEach(k => {
        const key = `${k.category_id}||${k.kra_name}||${k.kpi_name}`;
        const s = countMap.get(key) || new Set<string>();
        s.add(k.employee_id);
        countMap.set(key, s);
      });

      // 3. Build result - only KPIs with employees, plus count
      const result: OrgLevelKpiWithEmployees[] = [];
      let unmappedCount = 0;

      uniqueMap.forEach((kpi, key) => {
        const empSet = countMap.get(key);
        // Unique definitions count as 1 employee (the template row itself), so real employees = size - 1 OR just use the count
        // Actually the same employee_id can appear — count distinct
        const count = empSet ? empSet.size : 0;
        // A KPI is "mapped" if there's more than 1 record (i.e. at least 1 employee besides the org template)
        // But since we deduped, all records have employee_id — let's count as-is
        // If count >= 1, there's at least 1 employee with this KPI
        if (count >= 1) {
          result.push({
            kpi: kpi as unknown as OrgLevelKpiWithEmployees['kpi'],
            employeeCount: count,
          });
        } else {
          unmappedCount++;
        }
      });

      return { kpis: result, unmappedCount, totalOrgKpis: uniqueMap.size };
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}
