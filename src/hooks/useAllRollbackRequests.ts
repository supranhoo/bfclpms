import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type RollbackStatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'expired';

export interface EnrichedRollbackRequest {
  id: string;
  kpi_id: string;
  requested_by: string;
  requested_from_status: string;
  target_status: string;
  reason: string;
  status: string;
  actioned_by: string | null;
  actioned_at: string | null;
  created_at: string;
  requester: { full_name: string | null; employee_code: string | null } | null;
  employee: { full_name: string | null; employee_code: string | null; reporting_manager_id: string | null } | null;
  kpi: { kpi_name: string; kra_name: string; review_period: string | null; review_year: number | null; employee_id: string } | null;
}

export function useAllRollbackRequests(statusFilter: RollbackStatusFilter = 'all') {
  return useQuery({
    queryKey: ['all-rollback-requests', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('kpi_rollback_requests')
        .select(`
          *,
          requester:profiles!kpi_rollback_requests_requested_by_fkey(full_name, employee_code),
          kpi:kpis!kpi_rollback_requests_kpi_id_fkey(kpi_name, kra_name, review_period, review_year, employee_id)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch employee profiles for each unique employee_id from KPIs
      const employeeIds = [...new Set((data || []).map((r: any) => r.kpi?.employee_id).filter(Boolean))];
      
      let employeeMap: Record<string, { full_name: string | null; employee_code: string | null; reporting_manager_id: string | null }> = {};
      if (employeeIds.length > 0) {
        const { data: employees } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code, reporting_manager_id')
          .in('id', employeeIds);
        
        (employees || []).forEach(emp => {
          employeeMap[emp.id] = { full_name: emp.full_name, employee_code: emp.employee_code, reporting_manager_id: emp.reporting_manager_id };
        });
      }

      return (data || []).map((r: any): EnrichedRollbackRequest => ({
        ...r,
        requester: r.requester || null,
        employee: r.kpi?.employee_id ? employeeMap[r.kpi.employee_id] || null : null,
        kpi: r.kpi || null,
      }));
    },
  });
}

export function useRollbackStatusCounts() {
  return useQuery({
    queryKey: ['rollback-status-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kpi_rollback_requests')
        .select('status');
      if (error) throw error;

      const counts = { pending: 0, approved: 0, rejected: 0, expired: 0 };
      (data || []).forEach(r => {
        if (r.status in counts) counts[r.status as keyof typeof counts]++;
      });
      return counts;
    },
  });
}
