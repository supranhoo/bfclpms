import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type IncrementMethodType = 'full' | 'prorated_doj' | 'custom';

export interface IncrementMethodConfigRow {
  id: string;
  assessment_year: string;
  company_id: string | null;
  division_id: string | null;
  business_unit_id: string | null;
  category_id: string | null;
  level_id: string | null;
  location_id: string | null;
  method: IncrementMethodType;
  version: number;
  status: 'draft' | 'active' | 'archived';
  copied_from_config_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface IncrementMethodSlabRow {
  id: string;
  method_config_id: string;
  from_months: number;
  to_months: number | null;
  percent_of_slab: number;
  sort_order: number;
}

export interface IncrementMethodScope {
  assessment_year: string;
  company_id: string | null;
}

function applyScope(q: any, scope: IncrementMethodScope) {
  q = q.eq('assessment_year', scope.assessment_year);
  q = scope.company_id ? q.eq('company_id', scope.company_id) : q.is('company_id', null);
  q = q.is('division_id', null).is('business_unit_id', null)
       .is('category_id', null).is('level_id', null).is('location_id', null);
  return q;
}

export function useIncrementMethodConfig(scope: IncrementMethodScope | null) {
  return useQuery({
    queryKey: ['increment-method-config', scope],
    enabled: !!scope?.assessment_year,
    queryFn: async () => {
      if (!scope) return null;
      const { data, error } = await applyScope(
        supabase.from('increment_method_configs').select('*').eq('status', 'active'),
        scope,
      ).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as IncrementMethodConfigRow) ?? null;
    },
  });
}

export function useIncrementMethodSlabs(configId: string | null) {
  return useQuery({
    queryKey: ['increment-method-slabs', configId],
    enabled: !!configId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('increment_method_slabs')
        .select('*')
        .eq('method_config_id', configId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as IncrementMethodSlabRow[]) ?? [];
    },
  });
}

export function useIncrementMethodVersionHistory(scope: IncrementMethodScope | null) {
  return useQuery({
    queryKey: ['increment-method-config-history', scope],
    enabled: !!scope?.assessment_year,
    queryFn: async () => {
      if (!scope) return [];
      const { data, error } = await applyScope(
        supabase.from('increment_method_configs').select('*'),
        scope,
      ).order('version', { ascending: false });
      if (error) throw error;
      return (data as IncrementMethodConfigRow[]) ?? [];
    },
  });
}

export interface SlabDraft {
  from_months: number;
  to_months: number | null;
  percent_of_slab: number;
}

export function useSaveIncrementMethod() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      scope: IncrementMethodScope;
      method: IncrementMethodType;
      slabs: SlabDraft[];
      existing?: IncrementMethodConfigRow | null;
    }) => {
      const { scope, method, slabs, existing } = args;
      const user = (await supabase.auth.getUser()).data.user;
      if (existing) {
        await supabase.from('increment_method_configs').update({ status: 'archived' }).eq('id', existing.id);
      }
      const nextVersion = (existing?.version ?? 0) + 1;
      const { data: inserted, error } = await supabase
        .from('increment_method_configs')
        .insert([{
          assessment_year: scope.assessment_year,
          company_id: scope.company_id,
          method,
          version: nextVersion,
          status: 'active',
          copied_from_config_id: existing?.id ?? null,
          created_by: user?.id ?? null,
        } as any])
        .select('*')
        .single();
      if (error) throw error;
      if (method === 'custom' && slabs.length > 0) {
        const rows = slabs.map((s, i) => ({
          method_config_id: (inserted as any).id,
          from_months: s.from_months,
          to_months: s.to_months,
          percent_of_slab: s.percent_of_slab,
          sort_order: i,
        }));
        const { error: slabErr } = await supabase.from('increment_method_slabs').insert(rows as any);
        if (slabErr) throw slabErr;
      }
      return inserted as IncrementMethodConfigRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['increment-method-config'] });
      qc.invalidateQueries({ queryKey: ['increment-method-slabs'] });
      qc.invalidateQueries({ queryKey: ['increment-method-config-history'] });
      toast({ title: 'Increment method configuration saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useCopyIncrementMethodFromYear() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { fromYear: string; toScope: IncrementMethodScope }) => {
      const { fromYear, toScope } = args;
      const { data: src, error: srcErr } = await applyScope(
        supabase.from('increment_method_configs').select('*').eq('status', 'active'),
        { assessment_year: fromYear, company_id: toScope.company_id },
      ).maybeSingle();
      if (srcErr && srcErr.code !== 'PGRST116') throw srcErr;
      if (!src) throw new Error(`No active configuration found for ${fromYear}.`);

      const { data: srcSlabs } = await supabase
        .from('increment_method_slabs').select('*')
        .eq('method_config_id', (src as any).id)
        .order('sort_order');

      const { data: existing } = await applyScope(
        supabase.from('increment_method_configs').select('*').eq('status', 'active'),
        toScope,
      ).maybeSingle();
      if (existing) {
        await supabase.from('increment_method_configs').update({ status: 'archived' }).eq('id', (existing as any).id);
      }
      const user = (await supabase.auth.getUser()).data.user;
      const nextVersion = ((existing as any)?.version ?? 0) + 1;
      const { data: inserted, error } = await supabase
        .from('increment_method_configs')
        .insert([{
          assessment_year: toScope.assessment_year,
          company_id: toScope.company_id,
          method: (src as any).method,
          version: nextVersion,
          status: 'active',
          copied_from_config_id: (src as any).id,
          created_by: user?.id ?? null,
        } as any])
        .select('*').single();
      if (error) throw error;
      if ((src as any).method === 'custom' && srcSlabs && srcSlabs.length > 0) {
        const rows = (srcSlabs as any[]).map((s, i) => ({
          method_config_id: (inserted as any).id,
          from_months: s.from_months,
          to_months: s.to_months,
          percent_of_slab: s.percent_of_slab,
          sort_order: i,
        }));
        await supabase.from('increment_method_slabs').insert(rows as any);
      }
      return inserted as IncrementMethodConfigRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['increment-method-config'] });
      qc.invalidateQueries({ queryKey: ['increment-method-slabs'] });
      qc.invalidateQueries({ queryKey: ['increment-method-config-history'] });
      toast({ title: 'Copied from previous year' });
    },
    onError: (err: Error) => {
      toast({ title: 'Copy failed', description: err.message, variant: 'destructive' });
    },
  });
}