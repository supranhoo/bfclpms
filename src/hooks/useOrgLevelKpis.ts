import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPI } from '@/hooks/useKpis';

/** Normalize a string for consistent key matching: lowercase, collapse whitespace, trim */
const nk = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const mkKey = (catId: string, kra: string, kpi: string) => `${catId}||${nk(kra)}||${nk(kpi)}`;

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
  departmentIds: string[];
  employeeIds: string[];
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

      // 2. Build per-employee target map and KPI IDs map from raw records (before dedup discards them)
      const perEmployeeTargetMap = new Map<string, { target_value: number | null; uom: string | null }>();
      const employeeKpiIdsMap = new Map<string, string[]>();
      const countMap = new Map<string, Set<string>>();
      allOrgKpis?.forEach(k => {
        const key = `${k.category_id}||${k.kra_name}||${k.kpi_name}`;
        const s = countMap.get(key) || new Set<string>();
        s.add(k.employee_id);
        countMap.set(key, s);
        // Store per-employee target
        const empKey = `${key}||${k.employee_id}`;
        if (!perEmployeeTargetMap.has(empKey)) {
          perEmployeeTargetMap.set(empKey, { target_value: k.target_value, uom: k.uom });
        }
        // Collect KPI IDs per org KPI definition (for observations panel)
        if ((k as any).org_level_scope === 'employee') {
          const ids = employeeKpiIdsMap.get(key) || [];
          ids.push(k.id);
          employeeKpiIdsMap.set(key, ids);
        }
      });

      // 3. Fetch department_id for all mapped employees to build dept mapping
      const allEmployeeIds = new Set<string>();
      countMap.forEach(empSet => empSet.forEach(id => allEmployeeIds.add(id)));
      
      const deptMap = new Map<string, Set<string>>();
      
      if (allEmployeeIds.size > 0) {
        const empArray = Array.from(allEmployeeIds);
        // Fetch profiles in batches of 500
        const profiles: Array<{ id: string; department_id: string | null }> = [];
        for (let i = 0; i < empArray.length; i += 500) {
          const batch = empArray.slice(i, i + 500);
          const { data: batchProfiles } = await supabase
            .from('profiles')
            .select('id, department_id')
            .in('id', batch);
          if (batchProfiles) profiles.push(...batchProfiles);
        }
        
        const profileMap = new Map(profiles.map(p => [p.id, p.department_id]));
        
        // Build department mapping per KPI
        countMap.forEach((empSet, key) => {
          const deptIds = new Set<string>();
          empSet.forEach(empId => {
            const deptId = profileMap.get(empId);
            if (deptId) deptIds.add(deptId);
          });
          if (deptIds.size > 0) deptMap.set(key, deptIds);
        });
      }

      // 4. Build result
      const result: OrgLevelKpiWithEmployees[] = [];
      let unmappedCount = 0;

      uniqueMap.forEach((kpi, key) => {
        const empSet = countMap.get(key);
        const count = empSet ? empSet.size : 0;
        if (count >= 1) {
          result.push({
            kpi: kpi as unknown as OrgLevelKpiWithEmployees['kpi'],
            employeeCount: count,
            departmentIds: Array.from(deptMap.get(key) || []),
            employeeIds: Array.from(empSet || []),
          });
        } else {
          unmappedCount++;
        }
      });

      // Convert Maps to plain objects for React Query compatibility (structural sharing destroys Maps)
      const perEmployeeTargets: Record<string, { target_value: number | null; uom: string | null }> = {};
      perEmployeeTargetMap.forEach((val, key) => { perEmployeeTargets[key] = val; });

      const employeeKpiIds: Record<string, string[]> = {};
      employeeKpiIdsMap.forEach((val, key) => { employeeKpiIds[key] = val; });

      return { kpis: result, unmappedCount, totalOrgKpis: uniqueMap.size, perEmployeeTargetMap: perEmployeeTargets, employeeKpiIdsMap: employeeKpiIds };
    },
    enabled: !!reviewPeriod && !!reviewYear,
  });
}
