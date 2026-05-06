import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { KPI } from '@/hooks/useKpis';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPaged } from '@/lib/fetchAll';
import { normalizeKpiKey as mkKey } from '@/lib/orgKpiKey';

// Hook to get unique org-level KPIs (where is_org_level = true) for a period
export function useOrgLevelKpis(reviewPeriod?: string, reviewYear?: number) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-level-kpis', reviewPeriod, reviewYear, user?.id],
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
        const key = mkKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, kpi);
        }
      });
      
      return Array.from(uniqueMap.values()) as unknown as (KPI & { kra_categories: { id: string; name: string; color: string; weightage: number } })[];
    },
    enabled: isReady && !!user && !!reviewPeriod && !!reviewYear,
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
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: ['org-level-kpis-with-employees', reviewPeriod, reviewYear, user?.id],
    queryFn: async () => {
      // 1. Get all org-level KPIs (unique definitions). Use paginated fetch
      // because per-period org KPI counts can exceed the 1000-row PostgREST
      // cap (e.g. May 2026 ≈ 886 rows and growing). Without this, RLS-trimmed
      // results were silently truncated.
      const allOrgKpis = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('kpis')
          .select(`*, kra_categories (id, name, color, weightage)`)
          .eq('is_org_level', true)
          .eq('review_period', reviewPeriod!)
          .eq('review_year', reviewYear!)
          .order('category_id')
          .order('kra_name')
          .order('kpi_name')
          .range(from, to)
      );

      // Dedupe
      const uniqueMap = new Map<string, typeof allOrgKpis[0]>();
      allOrgKpis?.forEach(kpi => {
        const key = mkKey(kpi.category_id, kpi.kra_name, kpi.kpi_name);
        if (!uniqueMap.has(key)) uniqueMap.set(key, kpi);
      });

      // 2. Build per-employee target map and KPI IDs map from raw records (before dedup discards them)
      const perEmployeeTargetMap = new Map<string, { target_value: number | null; uom: string | null }>();
      const employeeKpiIdsMap = new Map<string, string[]>();
      const countMap = new Map<string, Set<string>>();
      // Track per-kpi-definition the set of underlying kpis.id rows still in 'kra_set' status.
      // NOTE: 'kra_set' alone does NOT mean "stuck" — that is the normal pre-propagation state.
      // Genuine "stuck" requires the OKV to already claim propagated/approved while the child
      // kpis row is still 'kra_set'. The OrgKpiDataEntry page combines this map with OKV.status.
      const stuckKpiRowsMap = new Map<string, string[]>();
      // Per-definition set of employee_ids whose child kpis row is still 'kra_set'.
      // Allows scope-aware stuck detection (employee/department/organization).
      const kraSetEmpIdsMap = new Map<string, Set<string>>();
      allOrgKpis?.forEach(k => {
        const key = mkKey(k.category_id, k.kra_name, k.kpi_name);
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
        // Collect kra_set KPI rows per definition (for "Stuck" detection)
        if ((k as any).status === 'kra_set') {
          const arr = stuckKpiRowsMap.get(key) || [];
          arr.push(k.id);
          stuckKpiRowsMap.set(key, arr);
          const empSet = kraSetEmpIdsMap.get(key) || new Set<string>();
          if (k.employee_id) empSet.add(k.employee_id);
          kraSetEmpIdsMap.set(key, empSet);
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

      const kraSetKpiRowsByKey: Record<string, string[]> = {};
      stuckKpiRowsMap.forEach((val, key) => { kraSetKpiRowsByKey[key] = val; });

      const kraSetEmpIdsByKey: Record<string, string[]> = {};
      kraSetEmpIdsMap.forEach((val, key) => { kraSetEmpIdsByKey[key] = Array.from(val); });

      return {
        kpis: result,
        unmappedCount,
        totalOrgKpis: uniqueMap.size,
        perEmployeeTargetMap: perEmployeeTargets,
        employeeKpiIdsMap: employeeKpiIds,
        kraSetKpiRowsByKey,
        kraSetEmpIdsByKey,
      };
    },
    enabled: isReady && !!user && !!reviewPeriod && !!reviewYear,
  });
}
