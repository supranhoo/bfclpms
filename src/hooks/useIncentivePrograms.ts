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
    mutationFn: async ({ id, ...values }: { id: string; name?: string; program_type?: string; description?: string; is_active?: boolean; effective_from?: string | null; effective_to?: string | null }) => {
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
        .select('*, business_units(name)')
        .eq('program_id', programId!)
        .order('slab_category')
        .order('sub_category')
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
      id?: string; program_id: string; business_unit_id?: string | null;
      slab_category: string; sub_category?: string | null;
      min_value: number; max_value: number; incentive_percent: number;
      rating_label?: string | null; sort_order?: number;
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
