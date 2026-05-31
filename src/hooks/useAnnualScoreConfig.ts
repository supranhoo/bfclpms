import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type AnnualScoreMethod = 'avg_all' | 'last_6' | 'custom';

export interface AnnualScoreConfigRow {
  id: string;
  assessment_year: string;
  company_id: string | null;
  division_id: string | null;
  business_unit_id: string | null;
  category_id: string | null;
  level_id: string | null;
  location_id: string | null;
  method: AnnualScoreMethod;
  custom_months: number[] | null;
  version: number;
  status: 'draft' | 'active' | 'archived';
  copied_from_config_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnnualScoreScope {
  assessment_year: string;
  company_id: string | null;
}

function applyScope(q: any, scope: AnnualScoreScope) {
  q = q.eq('assessment_year', scope.assessment_year);
  q = scope.company_id ? q.eq('company_id', scope.company_id) : q.is('company_id', null);
  // Phase 1: other scope dims always NULL (Applies to All)
  q = q.is('division_id', null).is('business_unit_id', null)
       .is('category_id', null).is('level_id', null).is('location_id', null);
  return q;
}

export function useAnnualScoreConfig(scope: AnnualScoreScope | null) {
  return useQuery({
    queryKey: ['annual-score-config', scope],
    enabled: !!scope?.assessment_year,
    queryFn: async () => {
      if (!scope) return null;
      const { data, error } = await applyScope(
        supabase.from('annual_score_configs').select('*').eq('status', 'active'),
        scope,
      ).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as AnnualScoreConfigRow) ?? null;
    },
  });
}

export function useAnnualScoreVersionHistory(scope: AnnualScoreScope | null) {
  return useQuery({
    queryKey: ['annual-score-config-history', scope],
    enabled: !!scope?.assessment_year,
    queryFn: async () => {
      if (!scope) return [];
      const { data, error } = await applyScope(
        supabase.from('annual_score_configs').select('*'),
        scope,
      ).order('version', { ascending: false });
      if (error) throw error;
      return (data as AnnualScoreConfigRow[]) ?? [];
    },
  });
}

export function useSaveAnnualScoreConfig() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      scope: AnnualScoreScope;
      method: AnnualScoreMethod;
      custom_months: number[] | null;
      existing?: AnnualScoreConfigRow | null;
    }) => {
      const { scope, method, custom_months, existing } = args;
      const user = (await supabase.auth.getUser()).data.user;
      // Archive existing active row, then insert new one as version+1
      if (existing) {
        await supabase
          .from('annual_score_configs')
          .update({ status: 'archived' })
          .eq('id', existing.id);
      }
      const nextVersion = (existing?.version ?? 0) + 1;
      const insertPayload: any = {
        assessment_year: scope.assessment_year,
        company_id: scope.company_id,
        method,
        custom_months: method === 'custom' ? custom_months : null,
        version: nextVersion,
        status: 'active',
        copied_from_config_id: existing?.id ?? null,
        created_by: user?.id ?? null,
      };
      const { data: inserted, error } = await supabase
        .from('annual_score_configs').insert(insertPayload).select('*').single();
      if (error) throw error;
      // Audit
      await supabase.from('annual_score_config_audit').insert([{
        config_id: inserted.id,
        action: existing ? 'update' : 'create',
        prev_value: (existing as any) ?? null,
        new_value: inserted as any,
        performed_by: user?.id ?? null,
      }]);
      return inserted as AnnualScoreConfigRow;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['annual-score-config'] });
      qc.invalidateQueries({ queryKey: ['annual-score-config-history'] });
      toast({ title: 'Annual score configuration saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useCopyAnnualScoreFromYear() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: { fromYear: string; toScope: AnnualScoreScope }) => {
      const { fromYear, toScope } = args;
      const { data: src, error: srcErr } = await applyScope(
        supabase.from('annual_score_configs').select('*').eq('status', 'active'),
        { assessment_year: fromYear, company_id: toScope.company_id },
      ).maybeSingle();
      if (srcErr && srcErr.code !== 'PGRST116') throw srcErr;
      if (!src) throw new Error(`No active configuration found for ${fromYear}.`);

      // archive existing target
      const { data: existing } = await applyScope(
        supabase.from('annual_score_configs').select('*').eq('status', 'active'),
        toScope,
      ).maybeSingle();
      if (existing) {
        await supabase.from('annual_score_configs').update({ status: 'archived' }).eq('id', (existing as any).id);
      }
      const user = (await supabase.auth.getUser()).data.user;
      const nextVersion = ((existing as any)?.version ?? 0) + 1;
      const payload: any = {
        assessment_year: toScope.assessment_year,
        company_id: toScope.company_id,
        method: (src as any).method,
        custom_months: (src as any).custom_months,
        version: nextVersion,
        status: 'active',
        copied_from_config_id: (src as any).id,
        created_by: user?.id ?? null,
      };
      const { data: inserted, error } = await supabase
        .from('annual_score_configs').insert(payload).select('*').single();
      if (error) throw error;
      await supabase.from('annual_score_config_audit').insert([{
        config_id: inserted.id,
        action: 'copy_from_year',
        prev_value: (existing as any) ?? null,
        new_value: { ...(inserted as any), copied_from_year: fromYear } as any,
        performed_by: user?.id ?? null,
      }]);
      return inserted as AnnualScoreConfigRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annual-score-config'] });
      qc.invalidateQueries({ queryKey: ['annual-score-config-history'] });
      toast({ title: 'Copied from previous year' });
    },
    onError: (err: Error) => {
      toast({ title: 'Copy failed', description: err.message, variant: 'destructive' });
    },
  });
}