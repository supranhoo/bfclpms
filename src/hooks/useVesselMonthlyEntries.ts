import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useVesselMonthlyEntries(programId: string, month: string, year: number) {
  return useQuery({
    queryKey: ['vessel-monthly-entries', programId, month, year],
    enabled: !!programId && !!month && !!year,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vessel_monthly_entries')
        .select('*')
        .eq('program_id', programId)
        .eq('month', month)
        .eq('year', year);
      if (error) throw error;

      const employeeIds = (data || []).map((r: any) => r.employee_id);
      if (employeeIds.length === 0) return [];

      // PII hardening (2026-06-22): use the SECURITY DEFINER directory RPC
      // so non-admin incentive-data-entry users (menuKey access) still see
      // employee names — direct `profiles` reads return zero rows for them.
      const { data: profiles } = await supabase.rpc(
        'get_profile_directory_entries',
        { _ids: employeeIds }
      );

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      return (data || []).map((r: any) => ({
        ...r,
        profile: profileMap.get(r.employee_id) || null,
      }));
    },
  });
}

export function useUpsertVesselEntries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entries: Array<{
      program_id: string;
      employee_id: string;
      month: string;
      year: number;
      vessels_handled: number;
      remarks?: string;
      updated_by?: string;
    }>) => {
      if (entries.length === 0) return;
      const { error } = await supabase
        .from('vessel_monthly_entries')
        .upsert(entries, { onConflict: 'program_id,employee_id,month,year' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vessel-monthly-entries'] });
      toast.success('Vessel entries saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
