import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface AuditAssignment {
  id: string;
  auditor_id: string;
  employee_id: string;
  assigned_by: string | null;
  created_at: string;
  auditor?: { id: string; full_name: string | null; email: string };
  employee?: { id: string; full_name: string | null; email: string; employee_code: string | null };
}

/**
 * Fetch all audit assignments (for the management dialog)
 */
export function useAuditAssignments() {
  return useQuery({
    queryKey: ['audit-assignments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_kpi_assignments')
        .select(`
          *,
          auditor:profiles!audit_kpi_assignments_auditor_id_fkey(id, full_name, email),
          employee:profiles!audit_kpi_assignments_employee_id_fkey(id, full_name, email, employee_code)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AuditAssignment[];
    },
  });
}

/**
 * Fetch assignments for the current user (auditor)
 */
export function useMyAuditAssignments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['audit-assignments', 'mine', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('audit_kpi_assignments')
        .select('employee_id')
        .eq('auditor_id', user.id);

      if (error) throw error;
      return new Set((data || []).map(d => d.employee_id));
    },
    enabled: !!user?.id,
  });
}

/**
 * Assign an employee to an auditor
 */
export function useAssignAuditEmployee() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ auditorId, employeeId }: { auditorId: string; employeeId: string }) => {
      const { data, error } = await supabase
        .from('audit_kpi_assignments')
        .insert({
          auditor_id: auditorId,
          employee_id: employeeId,
          assigned_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-assignments'] });
      toast({ title: 'Employee assigned to auditor' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to assign employee',
        description: error.message.includes('duplicate') ? 'This employee is already assigned to this auditor' : error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Remove an audit assignment
 */
export function useRemoveAuditAssignment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from('audit_kpi_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-assignments'] });
      toast({ title: 'Assignment removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove assignment', description: error.message, variant: 'destructive' });
    },
  });
}
