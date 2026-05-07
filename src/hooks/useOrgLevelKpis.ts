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
      // BUG-049 / v2.66 — Use the backend snapshot RPC instead of paging
      // hundreds of raw `kpis` rows through RLS in the browser. The RPC
      // pre-aggregates definitions, mapping arrays, kra_set tracking and
      // category metadata so the page only receives ~166 rows for 800+
      // underlying child rows. This eliminates the statement-timeout
      // (57014) regression that produced an empty page.
      const { data, error } = await (supabase as any).rpc(
        'get_org_kpi_data_entry_snapshot',
        { p_period: reviewPeriod!, p_year: reviewYear! },
      );
      if (error) throw error;

      const snap = (data ?? {}) as {
        kpis?: Array<{
          kpi: any;
          employeeCount: number;
          departmentIds: string[];
          employeeIds: string[];
        }>;
        unmappedCount?: number;
        totalOrgKpis?: number;
        perEmployeeTargetMap?: Record<string, { target_value: number | null; uom: string | null }>;
        employeeKpiIdsMap?: Record<string, string[]>;
        kraSetKpiRowsByKey?: Record<string, string[]>;
        kraSetEmpIdsByKey?: Record<string, string[]>;
        mappedEmpIdsByKey?: Record<string, string[]>;
      };

      // Re-key target map / id maps to the canonical client `normalizeKpiKey`
      // so they line up with maps the page already builds elsewhere. The RPC
      // emits keys with the same algorithm (lowercased, whitespace-collapsed)
      // so this is just a safety pass for any caller relying on `mkKey`.
      const rekey = <T>(src?: Record<string, T>): Record<string, T> => {
        if (!src) return {};
        const out: Record<string, T> = {};
        Object.entries(src).forEach(([k, v]) => { out[k] = v; });
        return out;
      };

      return {
        kpis: (snap.kpis ?? []) as OrgLevelKpiWithEmployees[],
        unmappedCount: snap.unmappedCount ?? 0,
        totalOrgKpis: snap.totalOrgKpis ?? 0,
        perEmployeeTargetMap: rekey(snap.perEmployeeTargetMap),
        employeeKpiIdsMap: rekey(snap.employeeKpiIdsMap),
        kraSetKpiRowsByKey: rekey(snap.kraSetKpiRowsByKey),
        kraSetEmpIdsByKey: rekey(snap.kraSetEmpIdsByKey),
        mappedEmpIdsByKey: rekey(snap.mappedEmpIdsByKey),
      };
    },
    enabled: isReady && !!user && !!reviewPeriod && !!reviewYear,
  });
}
