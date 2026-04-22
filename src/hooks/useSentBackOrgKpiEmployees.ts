import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SentBackInfo {
  reason: string;
  senderName: string;
  date: string;
}

/**
 * Detects which employees have sent-back org KPIs.
 * 
 * Logic: An employee's org KPI is considered "sent back" when:
 * 1. There exists a kpi_queries record with query_type='send_back' for their KPI, AND
 * 2. The KPI's current status is 'kra_set' (hasn't re-progressed past the sent-back stage)
 *
 * Returns Map<employeeId, SentBackInfo>
 */
export function useSentBackOrgKpiEmployees(
  categoryId: string | undefined,
  kraName: string | undefined,
  kpiName: string | undefined,
  reviewPeriod: string | undefined,
  reviewYear: number | undefined,
) {
  return useQuery({
    queryKey: ['sent-back-org-kpi-employees', categoryId, kraName, kpiName, reviewPeriod, reviewYear],
    queryFn: async () => {
      const map = new Map<string, SentBackInfo>();
      if (!categoryId || !kraName || !kpiName || !reviewPeriod || !reviewYear) return map;

      // 1. Find employee KPIs matching this org KPI definition that are at 'kra_set' status
      const { data: kpis, error: kpiErr } = await supabase
        .from('kpis')
        .select('id, employee_id, status')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true);

      if (kpiErr) throw kpiErr;
      if (!kpis || kpis.length === 0) return map;

      // Only consider KPIs that are still at 'kra_set' (not yet re-progressed)
      const kraSetKpis = kpis.filter(k => k.status === 'kra_set');
      if (kraSetKpis.length === 0) return map;

      const kpiIds = kraSetKpis.map(k => k.id);
      const kpiToEmployee = new Map(kraSetKpis.map(k => [k.id, k.employee_id]));

      // 2. Use SECURITY DEFINER RPC to get only ACTIVE send-back markers
      // (filters out resolved markers + markers older than the most recent KPI advance)
      const { data: queries, error: qErr } = await supabase
        .rpc('get_active_send_back_markers', { p_kpi_ids: kpiIds });

      if (qErr) throw qErr;
      if (!queries || queries.length === 0) return map;

      // 3. Get raiser names
      const raiserIds = [...new Set(queries.map(q => q.raised_by))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', raiserIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p.full_name || p.email || 'Unknown']) || []);

      // 4. Build map — only keep latest per employee
      for (const q of queries) {
        const empId = kpiToEmployee.get(q.kpi_id);
        if (!empId || map.has(empId)) continue; // already have latest for this employee
        map.set(empId, {
          reason: q.reason || 'No reason provided',
          senderName: profileMap.get(q.raised_by) || 'Unknown',
          date: q.created_at,
        });
      }

      return map;
    },
    enabled: !!categoryId && !!kraName && !!kpiName && !!reviewPeriod && !!reviewYear,
  });
}
