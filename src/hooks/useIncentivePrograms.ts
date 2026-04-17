import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// ── Programs ──

export function useIncentivePrograms() {
  return useQuery({
    queryKey: ['incentive-programs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_programs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateProgram() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: { name: string; program_type: string; description?: string; effective_from?: string; effective_to?: string }) => {
      const { data, error } = await supabase.from('incentive_programs').insert(values).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-programs'] }); toast({ title: 'Program created' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateProgram() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name?: string; program_type?: string; description?: string; is_active?: boolean; effective_from?: string | null; effective_to?: string | null; incentive_base?: string; min_kra_score?: number; no_kra_eligible?: boolean }) => {
      const { error } = await supabase.from('incentive_programs').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-programs'] }); toast({ title: 'Program updated' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteProgram() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_programs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-programs'] }); toast({ title: 'Program deleted' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Slabs ──

export function useIncentiveSlabs(programId?: string) {
  return useQuery({
    queryKey: ['incentive-slabs', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_slabs')
        .select('*, business_units(name), departments(name), companies(name), divisions(name), pms_grades(name)')
        .eq('program_id', programId!)
        .order('slab_category')
        .order('sub_category')
        .order('effective_from', { ascending: false })
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertSlab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: {
      id?: string; program_id: string;
      company_id?: string | null; division_id?: string | null;
      business_unit_id?: string | null; department_id?: string | null;
      pms_grade_id?: string | null; location?: string | null; pms_level?: string | null;
      applicable_designations?: string[] | null;
      slab_category: string; sub_category?: string | null;
      min_value: number; max_value: number; incentive_percent: number;
      rating_label?: string | null; sort_order?: number;
      effective_from?: string | null;
    }) => {
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from('incentive_slabs').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('incentive_slabs').insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-slabs'] }); toast({ title: 'Slab saved' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteSlab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_slabs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-slabs'] }); toast({ title: 'Slab deleted' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Program Mappings ──

export function useProgramMappings(programId?: string) {
  return useQuery({
    queryKey: ['incentive-program-mappings', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_program_mappings')
        .select('*')
        .eq('program_id', programId!)
        .order('mapping_type');
      if (error) throw error;
      return data;
    },
  });
}

export function useAddProgramMapping() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: { program_id: string; mapping_type: string; mapping_value: string }) => {
      const { error } = await supabase.from('incentive_program_mappings').insert(values);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-program-mappings'] }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useRemoveProgramMapping() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_program_mappings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-program-mappings'] }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useBulkAddProgramMappings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rows: { program_id: string; mapping_type: string; mapping_value: string }[]) => {
      if (rows.length === 0) return;
      const { error } = await supabase.from('incentive_program_mappings').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-program-mappings'] });
      toast({ title: 'Employees mapped successfully' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useBulkRemoveProgramMappings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from('incentive_program_mappings').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-program-mappings'] });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Disqualification Rules ──

export function useDisqualificationRules(programId?: string) {
  return useQuery({
    queryKey: ['incentive-dq-rules', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_disqualification_rules')
        .select('*')
        .eq('program_id', programId!)
        .order('rule_type');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertDqRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: { id?: string; program_id: string; rule_type: string; rule_config: any; is_active?: boolean; exemption_notes?: string | null }) => {
      if (values.id) {
        const { id, ...rest } = values;
        const { error } = await supabase.from('incentive_disqualification_rules').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('incentive_disqualification_rules').insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-dq-rules'] }); toast({ title: 'Rule saved' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteDqRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_disqualification_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-dq-rules'] }); toast({ title: 'Rule deleted' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

// ── Summary Counts ──

export function useSlabCount(programId?: string) {
  return useQuery({
    queryKey: ['incentive-slab-count', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_slabs')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', programId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useDqRuleCount(programId?: string) {
  return useQuery({
    queryKey: ['incentive-dq-rule-count', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_disqualification_rules')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', programId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMappingCount(programId?: string) {
  return useQuery({
    queryKey: ['incentive-mapping-count', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_program_mappings')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', programId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// ── Eligibility Fields ──

export function useEligibilityFields(programId?: string) {
  return useQuery({
    queryKey: ['incentive-eligibility-fields', programId],
    enabled: !!programId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_eligibility_fields')
        .select('*')
        .or(`program_id.is.null,program_id.eq.${programId}`)
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useAllEligibilityFields() {
  return useQuery({
    queryKey: ['incentive-eligibility-fields-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_eligibility_fields')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateEligibilityField() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: { program_id: string; field_key: string; field_label: string; field_type: string; default_value?: string | null; sort_order?: number }) => {
      const { error } = await supabase.from('incentive_eligibility_fields').insert(values);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-eligibility-fields'] }); toast({ title: 'Field added' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateEligibilityField() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; is_active?: boolean; field_label?: string; sort_order?: number }) => {
      const { error } = await supabase.from('incentive_eligibility_fields').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-eligibility-fields'] }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteEligibilityField() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('incentive_eligibility_fields').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-eligibility-fields'] }); toast({ title: 'Field removed' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}
