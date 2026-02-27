import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Fetch current auditor's KPI-level assignments grouped by employee.
 * Uses a two-step fetch to avoid ambiguous FK join errors.
 */
export function useMyKpiLevelAssignments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-kpi-level-assignments', user?.id],
    queryFn: async () => {
      if (!user?.id) return { assignedKpisByEmployee: new Map<string, string[]>(), allAssignedEmployeeIds: new Set<string>(), totalAssignedKpis: 0 };

      // Step 1: Get all KPI-level assignments for current auditor
      const { data: assignments, error: assignError } = await supabase
        .from('audit_kpi_level_assignments')
        .select('kpi_id')
        .eq('auditor_id', user.id);

      if (assignError) throw assignError;
      if (!assignments?.length) return { assignedKpisByEmployee: new Map<string, string[]>(), allAssignedEmployeeIds: new Set<string>(), totalAssignedKpis: 0 };

      const kpiIds = assignments.map(a => a.kpi_id);

      // Step 2: Get employee_id for each KPI
      const { data: kpis, error: kpiError } = await supabase
        .from('kpis')
        .select('id, employee_id')
        .in('id', kpiIds);

      if (kpiError) throw kpiError;

      // Step 3: Group by employee
      const assignedKpisByEmployee = new Map<string, string[]>();
      (kpis || []).forEach(k => {
        const existing = assignedKpisByEmployee.get(k.employee_id) || [];
        existing.push(k.id);
        assignedKpisByEmployee.set(k.employee_id, existing);
      });

      return {
        assignedKpisByEmployee,
        allAssignedEmployeeIds: new Set(assignedKpisByEmployee.keys()),
        totalAssignedKpis: kpiIds.length,
      };
    },
    enabled: !!user?.id,
  });
}
