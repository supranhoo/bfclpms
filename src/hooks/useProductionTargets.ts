import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Business Unit Sub-Units ──

export function useBusinessUnitSubUnits(businessUnitId?: string) {
  return useQuery({
    queryKey: ['bu-sub-units', businessUnitId],
    enabled: !!businessUnitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_unit_sub_units')
        .select('*')
        .eq('business_unit_id', businessUnitId!)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useAllSubUnits() {
  return useQuery({
    queryKey: ['bu-sub-units-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_unit_sub_units')
        .select('*, business_units(name)')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertSubUnit() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: { id?: string; business_unit_id: string; label: string; capacity?: string; product_types?: string[]; sort_order?: number; is_active?: boolean }) => {
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from('business_unit_sub_units').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('business_unit_sub_units').insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bu-sub-units'] }); toast({ title: 'Sub-unit saved' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteSubUnit() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('business_unit_sub_units').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bu-sub-units'] }); toast({ title: 'Sub-unit deleted' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Production Targets ──

export function useProductionTargets(programId?: string, businessUnitId?: string, month?: string, year?: number) {
  return useQuery({
    queryKey: ['production-targets', programId, businessUnitId, month, year],
    enabled: !!programId && !!month && !!year,
    queryFn: async () => {
      let query = supabase
        .from('production_targets')
        .select('*')
        .eq('program_id', programId!)
        .eq('month', month!)
        .eq('year', year!);
      if (businessUnitId) query = query.eq('business_unit_id', businessUnitId);
      query = query.order('sub_unit_label').order('slab_category');
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertProductionTargets() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rows: Array<{
      id?: string; program_id: string; division_id?: string | null; business_unit_id?: string | null;
      department_id?: string | null; sub_unit_label?: string | null; slab_category: string;
      month: string; year: number; target_value: number; achieved_value: number;
      incentive_percent: number; remarks?: string | null; updated_by?: string | null;
    }>) => {
      const { error } = await supabase.from('production_targets').upsert(rows, {
        onConflict: 'program_id,business_unit_id,sub_unit_label,slab_category,month,year',
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production-targets'] }); toast({ title: 'Production data saved' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Allocation Rules ──

export function useAllocationRules(programId?: string) {
  return useQuery({
    queryKey: ['allocation-rules', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_allocation_rules')
        .select('*, business_units:target_bu_id(name)')
        .eq('program_id', programId!)
        .order('source_label')
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertAllocationRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: { id?: string; program_id: string; source_label: string; target_bu_id?: string | null; target_sub_unit?: string | null; allocation_pct: number; sort_order?: number }) => {
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from('incentive_allocation_rules').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('incentive_allocation_rules').insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['allocation-rules'] }); toast({ title: 'Allocation rule saved' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteAllocationRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_allocation_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['allocation-rules'] }); toast({ title: 'Allocation rule deleted' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Incentive Status Override ──

export function useOverrideIncentiveStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, incentive_status, reason, overriddenBy }: { id: string; incentive_status: string; reason: string; overriddenBy: string }) => {
      const { error } = await supabase
        .from('employee_incentive_records')
        .update({
          incentive_status,
          status_override_reason: reason,
          status_overridden_by: overriddenBy,
          status_overridden_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-records'] }); toast({ title: 'Status updated' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
