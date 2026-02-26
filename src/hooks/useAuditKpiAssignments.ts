import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface AuditKpiAssignment {
  auditor_id: string;
  auditor_name: string;
}

/**
 * Fetch KPI-level audit assignments for a set of KPI IDs.
 * Returns a Map<kpi_id, AuditKpiAssignment>.
 */
export function useAuditKpiAssignments(kpiIds: string[]) {
  return useQuery({
    queryKey: ['audit-kpi-level-assignments', kpiIds],
    queryFn: async () => {
      if (!kpiIds.length) return new Map<string, AuditKpiAssignment>();

      const { data, error } = await supabase
        .from('audit_kpi_level_assignments' as any)
        .select('kpi_id, auditor_id, profiles!audit_kpi_level_assignments_auditor_id_fkey(full_name)')
        .in('kpi_id', kpiIds);

      if (error) throw error;

      const map = new Map<string, AuditKpiAssignment>();
      (data || []).forEach((row: any) => {
        map.set(row.kpi_id, {
          auditor_id: row.auditor_id,
          auditor_name: row.profiles?.full_name || 'Unknown',
        });
      });
      return map;
    },
    enabled: kpiIds.length > 0,
  });
}

/** Assign a KPI to an auditor */
export function useAssignKpiToAuditor() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ kpiId, auditorId }: { kpiId: string; auditorId: string }) => {
      const { error } = await supabase
        .from('audit_kpi_level_assignments' as any)
        .upsert(
          { kpi_id: kpiId, auditor_id: auditorId, assigned_by: user?.id },
          { onConflict: 'kpi_id,auditor_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-kpi-level-assignments'] });
    },
  });
}

/** Remove a KPI-level audit assignment */
export function useRemoveKpiAuditAssignment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ kpiId }: { kpiId: string }) => {
      const { error } = await supabase
        .from('audit_kpi_level_assignments' as any)
        .delete()
        .eq('kpi_id', kpiId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-kpi-level-assignments'] });
    },
  });
}

/** Fetch all auditors (users with auditor role) */
export function useAuditorsList() {
  return useQuery({
    queryKey: ['auditors-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, profiles!user_roles_user_id_fkey(id, full_name, employee_code)')
        .eq('role', 'auditor');

      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.user_id,
        full_name: row.profiles?.full_name || 'Unknown',
        employee_code: row.profiles?.employee_code || null,
      }));
    },
  });
}
