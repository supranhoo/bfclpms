import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditorWorkloadEntry {
  auditorId: string;
  auditorName: string;
  employeeCode: string | null;
  employeeIds: Set<string>;
  kpiIds: Set<string>;
}

/**
 * Fetch all auditor-to-employee and auditor-to-KPI mappings.
 * Returns a Map<auditor_id, AuditorWorkloadEntry> for the workload summary bar.
 */
export function useAuditorWorkloadSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['auditor-workload-summary'],
    queryFn: async () => {
      // Step 1: Fetch all employee-level assignments
      const { data: empAssignments, error: empErr } = await supabase
        .from('audit_kpi_assignments')
        .select('auditor_id, employee_id');
      if (empErr) throw empErr;

      // Step 2: Fetch all KPI-level assignments
      const { data: kpiAssignments, error: kpiErr } = await supabase
        .from('audit_kpi_level_assignments')
        .select('auditor_id, kpi_id');
      if (kpiErr) throw kpiErr;

      // Collect unique auditor IDs
      const auditorIds = new Set<string>();
      empAssignments?.forEach(r => auditorIds.add(r.auditor_id));
      kpiAssignments?.forEach(r => auditorIds.add(r.auditor_id));

      if (auditorIds.size === 0) return new Map<string, AuditorWorkloadEntry>();

      // Step 3: Fetch auditor profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .in('id', [...auditorIds]);

      const profileMap = new Map(
        (profiles || []).map(p => [p.id, { name: p.full_name || 'Unknown', code: p.employee_code }])
      );

      // Step 4: Build the map
      const result = new Map<string, AuditorWorkloadEntry>();

      const getOrCreate = (auditorId: string): AuditorWorkloadEntry => {
        if (!result.has(auditorId)) {
          const profile = profileMap.get(auditorId);
          result.set(auditorId, {
            auditorId,
            auditorName: profile?.name || 'Unknown',
            employeeCode: profile?.code || null,
            employeeIds: new Set(),
            kpiIds: new Set(),
          });
        }
        return result.get(auditorId)!;
      };

      empAssignments?.forEach(r => {
        getOrCreate(r.auditor_id).employeeIds.add(r.employee_id);
      });

      kpiAssignments?.forEach(r => {
        getOrCreate(r.auditor_id).kpiIds.add(r.kpi_id);
      });

      // Also resolve KPI-level → employee mapping via kpis table
      if (kpiAssignments && kpiAssignments.length > 0) {
        const allKpiIds = [...new Set(kpiAssignments.map(r => r.kpi_id))];
        // Batch fetch in chunks of 500
        for (let i = 0; i < allKpiIds.length; i += 500) {
          const chunk = allKpiIds.slice(i, i + 500);
          const { data: kpis } = await supabase
            .from('kpis')
            .select('id, employee_id')
            .in('id', chunk);

          const kpiToEmployee = new Map((kpis || []).map(k => [k.id, k.employee_id]));

          kpiAssignments.forEach(r => {
            const empId = kpiToEmployee.get(r.kpi_id);
            if (empId) {
              getOrCreate(r.auditor_id).employeeIds.add(empId);
            }
          });
        }
      }

      return result;
    },
    enabled,
    staleTime: 60_000,
  });
}
