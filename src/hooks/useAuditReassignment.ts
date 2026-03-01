import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ReassignParams {
  sourceAuditorId: string;
  targetAuditorId: string;
  employeeIds: string[];
}

/**
 * Bulk reassign employees (and their KPI-level assignments) from one auditor to another.
 */
export function useReassignEmployees() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ sourceAuditorId, targetAuditorId, employeeIds }: ReassignParams) => {
      if (employeeIds.length === 0) throw new Error('No employees selected');
      if (sourceAuditorId === targetAuditorId) throw new Error('Source and target auditor are the same');

      // 1. Delete any existing assignments for target auditor + these employees (to avoid unique constraint)
      await supabase
        .from('audit_kpi_assignments')
        .delete()
        .eq('auditor_id', targetAuditorId)
        .in('employee_id', employeeIds);

      // 2. Update employee-level assignments
      const { error: empError } = await supabase
        .from('audit_kpi_assignments')
        .update({ auditor_id: targetAuditorId })
        .eq('auditor_id', sourceAuditorId)
        .in('employee_id', employeeIds);

      if (empError) throw empError;

      // 3. Get KPI IDs for these employees
      const { data: kpis, error: kpiError } = await supabase
        .from('kpis')
        .select('id')
        .in('employee_id', employeeIds);

      if (kpiError) throw kpiError;

      // 4. Update KPI-level assignments if any exist
      if (kpis && kpis.length > 0) {
        const kpiIds = kpis.map(k => k.id);

        // Remove potential duplicates first
        await supabase
          .from('audit_kpi_level_assignments')
          .delete()
          .eq('auditor_id', targetAuditorId)
          .in('kpi_id', kpiIds);

        const { error: kpiAssignError } = await supabase
          .from('audit_kpi_level_assignments')
          .update({ auditor_id: targetAuditorId })
          .eq('auditor_id', sourceAuditorId)
          .in('kpi_id', kpiIds);

        if (kpiAssignError) throw kpiAssignError;
      }

      return { count: employeeIds.length };
    },
    onSuccess: ({ count }) => {
      queryClient.invalidateQueries({ queryKey: ['audit-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpi-level-assignments'] });
      toast({ title: `${count} employee${count > 1 ? 's' : ''} reassigned successfully` });
    },
    onError: (error: Error) => {
      toast({ title: 'Reassignment failed', description: error.message, variant: 'destructive' });
    },
  });
}
