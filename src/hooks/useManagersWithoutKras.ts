/**
 * useManagersWithoutKras — v2.66.11.12
 *
 * Returns managers whose (direct ∪ indirect) roster has ZERO KPIs for the
 * given review_period / review_year. Surfaces the population that the
 * Team Reviews "no KPIs assigned" diagnostic flags but admins haven't
 * actioned (RCA: Sajid Raza follow-up, May 2026).
 *
 * A manager qualifies if:
 *   - role = 'manager' AND is_active = true
 *   - has at least `minReports` direct + indirect active reports
 *   - zero rows in `kpis` for those reports in the requested period
 *
 * Cached for 5 minutes; fetches are paged via fetchAllPaged so the
 * 1000-row PostgREST cap can never silently truncate the roster.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';

export interface ManagerWithoutKras {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  direct_count: number;
  indirect_count: number;
  total_reports: number;
}

export function useManagersWithoutKras(
  reviewPeriod: string | null | undefined,
  reviewYear: number | null | undefined,
  options?: { minReports?: number; enabled?: boolean },
) {
  const minReports = options?.minReports ?? 5;
  return useQuery<ManagerWithoutKras[]>({
    queryKey: ['managers-without-kras', reviewPeriod, reviewYear, minReports],
    enabled: !!reviewPeriod && !!reviewYear && (options?.enabled ?? true),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // 1. Active managers (user_roles.role = 'manager').
      const { data: roleRows, error: roleErr } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'manager');
      if (roleErr) throw roleErr;
      const managerIds = Array.from(new Set((roleRows || []).map(r => r.user_id)));
      if (managerIds.length === 0) return [];

      // 2. Active profiles + reporting tree (paged to bypass 1000-row cap).
      const profiles = await fetchAllPaged<{ id: string; full_name: string | null; employee_code: string | null; reporting_manager_id: string | null; is_active: boolean }>(
        (from, to) => supabase
          .from('profiles')
          .select('id, full_name, employee_code, reporting_manager_id, is_active')
          .eq('is_active', true)
          .order('id')
          .range(from, to),
      );

      // Index reports by manager id (one hop).
      const directByMgr = new Map<string, string[]>();
      for (const p of profiles) {
        if (!p.reporting_manager_id) continue;
        const list = directByMgr.get(p.reporting_manager_id) ?? [];
        list.push(p.id);
        directByMgr.set(p.reporting_manager_id, list);
      }

      // Build direct + indirect rosters for every active manager.
      type Roster = { mgr: { id: string; full_name: string | null; employee_code: string | null }; direct: string[]; indirect: string[] };
      const profileById = new Map(profiles.map(p => [p.id, p]));
      const rosters: Roster[] = [];
      for (const mid of managerIds) {
        const mp = profileById.get(mid);
        if (!mp) continue; // inactive or unknown
        const direct = directByMgr.get(mid) ?? [];
        const indirect: string[] = [];
        for (const dId of direct) {
          const sub = directByMgr.get(dId);
          if (sub) indirect.push(...sub.filter(id => id !== mid));
        }
        if (direct.length + indirect.length < minReports) continue;
        rosters.push({ mgr: { id: mp.id, full_name: mp.full_name, employee_code: mp.employee_code }, direct, indirect });
      }
      if (rosters.length === 0) return [];

      // 3. Single paged fetch of employee_ids that DO have KPIs in the period.
      const kpiRows = await fetchAllPaged<{ employee_id: string | null }>(
        (from, to) => supabase
          .from('kpis')
          .select('employee_id')
          .eq('review_period', reviewPeriod!)
          .eq('review_year', reviewYear!)
          .order('id')
          .range(from, to),
      );
      const employeesWithKpis = new Set(kpiRows.map(r => r.employee_id).filter((x): x is string => !!x));

      // 4. Pick rosters with ZERO covered employees.
      const out: ManagerWithoutKras[] = [];
      for (const r of rosters) {
        const all = [...r.direct, ...r.indirect];
        const covered = all.some(id => employeesWithKpis.has(id));
        if (covered) continue;
        out.push({
          id: r.mgr.id,
          full_name: r.mgr.full_name,
          employee_code: r.mgr.employee_code,
          direct_count: r.direct.length,
          indirect_count: r.indirect.length,
          total_reports: r.direct.length + r.indirect.length,
        });
      }
      out.sort((a, b) => b.total_reports - a.total_reports);
      return out;
    },
  });
}
