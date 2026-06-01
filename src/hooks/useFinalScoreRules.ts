import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  FinalScoreRuleType,
  MissingScorePolicy,
  WorkflowStageKey,
} from '@/lib/finalScoreResolver';

export type FinalScoreScopeType = 'template' | 'employee' | 'department' | 'pms_grade';

export interface WorkflowFinalScoreRule {
  id: string;
  scope_type: FinalScoreScopeType;
  scope_value: string | null;
  workflow_template_id: string;
  review_period: string | null;
  review_year: number | null;
  rule_type: FinalScoreRuleType;
  stage_weights: Partial<Record<WorkflowStageKey, number>> | null;
  missing_score_policy: MissingScorePolicy;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

const TABLE = 'workflow_final_score_rules' as const;

export function useFinalScoreRules() {
  return useQuery({
    queryKey: ['final-score-rules'],
    queryFn: async () => {
      // Table is new; types.ts may not include it until next regen. Cast to any
      // for the table identifier only — the row shape is fully typed via the
      // local WorkflowFinalScoreRule interface.
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WorkflowFinalScoreRule[];
    },
  });
}

export interface UpsertFinalScoreRuleInput {
  id?: string;
  scope_type: FinalScoreScopeType;
  scope_value: string | null;
  workflow_template_id: string;
  review_period: string | null;
  review_year: number | null;
  rule_type: FinalScoreRuleType;
  stage_weights: Partial<Record<WorkflowStageKey, number>> | null;
  missing_score_policy: MissingScorePolicy;
  is_active?: boolean;
  notes?: string | null;
}

export function useUpsertFinalScoreRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: UpsertFinalScoreRuleInput) => {
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        ...input,
        is_active: input.is_active ?? true,
        updated_by: u.user?.id ?? null,
        ...(input.id ? {} : { created_by: u.user?.id ?? null }),
      };
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as WorkflowFinalScoreRule;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-score-rules'] });
      toast({ title: 'Saved', description: 'Final score rule saved.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteFinalScoreRule() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from(TABLE).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['final-score-rules'] });
      toast({ title: 'Removed', description: 'Final score rule removed.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });
}