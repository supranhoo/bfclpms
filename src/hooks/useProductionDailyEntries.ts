import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Production Rates ──

export function useProductionRates(programId: string) {
  return useQuery({
    queryKey: ['incentive-production-rates', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_production_rates')
        .select('*, profiles:employee_id(id, full_name, employee_code, email, designation, departments(name))')
        .eq('program_id', programId)
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useUpsertProductionRate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: {
      id?: string;
      program_id: string;
      employee_id: string;
      rate_per_ton: number;
      remarks?: string;
    }) => {
      const { data, error } = await supabase
        .from('incentive_production_rates')
        .upsert(values, { onConflict: 'program_id,employee_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ['incentive-production-rates', v.program_id] });
      qc.invalidateQueries({ queryKey: ['production-rate-count'] });
      toast({ title: 'Production rate saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteProductionRate() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, programId }: { id: string; programId: string }) => {
      const { error } = await supabase.from('incentive_production_rates').delete().eq('id', id);
      if (error) throw error;
      return programId;
    },
    onSuccess: (programId) => {
      qc.invalidateQueries({ queryKey: ['incentive-production-rates', programId] });
      qc.invalidateQueries({ queryKey: ['production-rate-count'] });
      toast({ title: 'Rate removed' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Production Rate Count (for detection) ──

export function useProductionRateCount(programId: string) {
  return useQuery({
    queryKey: ['production-rate-count', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_production_rates')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', programId);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// ── Daily Entries ──

export function useProductionDailyEntries(programId: string, month: string, year: number) {
  return useQuery({
    queryKey: ['production-daily-entries', programId, month, year],
    enabled: !!programId && !!month && !!year,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_daily_entries')
        .select('*')
        .eq('program_id', programId)
        .eq('month', month)
        .eq('year', year);
      if (error) throw error;
      return data || [];
    },
  });
}

export function useBulkUpsertDailyEntries() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (entries: Array<{
      program_id: string;
      employee_id: string;
      month: string;
      year: number;
      daily_values: Record<string, number>;
      updated_by?: string;
    }>) => {
      const { error } = await supabase
        .from('production_daily_entries')
        .upsert(entries, { onConflict: 'program_id,employee_id,month,year' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-daily-entries'] });
      toast({ title: 'Daily entries saved' });
    },
    onError: (e: any) => toast({ title: 'Error saving entries', description: e.message, variant: 'destructive' }),
  });
}
