import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ConfirmationTreatment } from '@/lib/confirmationIncrementAdjuster';
import type { ConfirmationTransition } from '@/lib/confirmationIncrementAdjuster';

export interface ConfirmationIncrementRuleRow {
  id: string;
  assessment_year: string;
  company_id: string | null;
  category_id: string | null;
  level_id: string | null;
  treatment: ConfirmationTreatment;
  notes: string | null;
  version: number;
  status: 'draft' | 'active' | 'archived';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  applicable_transitions: ConfirmationTransition[];
  company_scope_mode: 'global' | 'selected' | 'per_company';
  selected_company_ids: string[];
}

export interface ConfirmationRuleScope {
  assessment_year: string;
  company_id: string | null;
  category_id: string | null;
  level_id: string | null;
}

function applyScope(q: any, scope: ConfirmationRuleScope) {
  q = q.eq('assessment_year', scope.assessment_year);
  q = scope.company_id ? q.eq('company_id', scope.company_id) : q.is('company_id', null);
  q = scope.category_id ? q.eq('category_id', scope.category_id) : q.is('category_id', null);
  q = scope.level_id ? q.eq('level_id', scope.level_id) : q.is('level_id', null);
  return q;
}

export function useConfirmationIncrementRule(scope: ConfirmationRuleScope | null) {
  return useQuery({
    queryKey: ['confirmation-increment-rule', scope],
    enabled: !!scope?.assessment_year,
    queryFn: async () => {
      if (!scope) return null;
      const { data, error } = await applyScope(
        (supabase as any).from('confirmation_increment_rules').select('*').eq('status', 'active'),
        scope,
      ).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as ConfirmationIncrementRuleRow) ?? null;
    },
  });
}

export function useConfirmationIncrementRuleExists(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['confirmation-increment-rule-exists', assessmentYear],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('confirmation_increment_rules')
        .select('id')
        .eq('assessment_year', assessmentYear)
        .eq('status', 'active')
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
}

export function useConfirmationIncrementRuleHistory(scope: ConfirmationRuleScope | null) {
  return useQuery({
    queryKey: ['confirmation-increment-rule-history', scope],
    enabled: !!scope?.assessment_year,
    queryFn: async () => {
      if (!scope) return [];
      const { data, error } = await applyScope(
        (supabase as any).from('confirmation_increment_rules').select('*'),
        scope,
      ).order('version', { ascending: false });
      if (error) throw error;
      return (data as ConfirmationIncrementRuleRow[]) ?? [];
    },
  });
}

export function useSaveConfirmationIncrementRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (args: {
      scope: ConfirmationRuleScope;
      treatment: ConfirmationTreatment;
      notes?: string | null;
      existing?: ConfirmationIncrementRuleRow | null;
      applicableTransitions: ConfirmationTransition[];
      companyScopeMode: 'global' | 'selected' | 'per_company';
      selectedCompanyIds: string[];
    }) => {
      const {
        scope, treatment, notes, existing,
        applicableTransitions, companyScopeMode, selectedCompanyIds,
      } = args;
      const user = (await supabase.auth.getUser()).data.user;
      if (existing) {
        await (supabase as any)
          .from('confirmation_increment_rules')
          .update({ status: 'archived' })
          .eq('id', existing.id);
      }
      const nextVersion = (existing?.version ?? 0) + 1;
      const { data, error } = await (supabase as any)
        .from('confirmation_increment_rules')
        .insert([{
          assessment_year: scope.assessment_year,
          company_id: scope.company_id,
          category_id: scope.category_id,
          level_id: scope.level_id,
          treatment,
          notes: notes ?? null,
          version: nextVersion,
          status: 'active',
          copied_from_rule_id: existing?.id ?? null,
          created_by: user?.id ?? null,
          applicable_transitions: applicableTransitions,
          company_scope_mode: companyScopeMode,
          selected_company_ids: selectedCompanyIds,
        }])
        .select('*')
        .single();
      if (error) throw error;
      return data as ConfirmationIncrementRuleRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['confirmation-increment-rule'] });
      qc.invalidateQueries({ queryKey: ['confirmation-increment-rule-history'] });
      toast({ title: 'Confirmation increment rule saved' });
    },
    onError: (err: Error) => {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    },
  });
}