import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useVesselRates(programId: string) {
  return useQuery({
    queryKey: ['vessel-rates', programId],
    enabled: !!programId,
    queryFn: async () => {
      // Fetch rates — join profiles manually since table is new
      const { data, error } = await supabase
        .from('incentive_vessel_rates' as any)
        .select('*')
        .eq('program_id', programId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      // Fetch profiles for these employees
      const employeeIds = (data || []).map((r: any) => r.employee_id);
      if (employeeIds.length === 0) return [];

      // PII hardening (2026-06-22): the broad "Incentive data entry users can
      // view active profiles" SELECT policy was dropped. Direct profile reads
      // from this hook return zero rows for non-admin incentive-data-entry
      // users (menuKey access), making the vessel grid render "Unknown" for
      // every employee. Route through the SECURITY DEFINER directory RPC.
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

export function useUpsertVesselRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { program_id: string; employee_id: string; rate_per_vessel: number; remarks?: string }) => {
      const { error } = await supabase
        .from('incentive_vessel_rates' as any)
        .upsert(values as any, { onConflict: 'program_id,employee_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vessel-rates'] });
      toast.success('Vessel rate saved');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteVesselRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('incentive_vessel_rates' as any)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vessel-rates'] });
      toast.success('Vessel rate removed');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
