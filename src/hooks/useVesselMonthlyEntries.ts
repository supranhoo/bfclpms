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

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code')
        .in('id', employeeIds);

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
