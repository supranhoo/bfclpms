/**
 * ADR-226 Phase 2 — Legacy recommendation import service layer.
 *
 * All writes go through SECURITY DEFINER RPCs; the client never touches the
 * recommendation tables directly. Import control is HR / Management / Admin only
 * (enforced server-side by `ar_can_decide_recommendation`).
 */
import { supabase } from '@/integrations/supabase/client';
import type { RecommendationKeywordRule } from '@/lib/annualReview/recommendationClassifier';

export interface RecommendationKeyword extends RecommendationKeywordRule {
  id: string;
  notes: string | null;
}

export interface ImportRunResult {
  run_id: string;
  dry_run: boolean;
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  needs_classification: number;
  type_breakdown: Record<string, number>;
  sample: Array<{
    instance_id: string;
    reviewer_role: string;
    types: string[];
    status: string;
    amount_kind: string | null;
    amount_value: number | null;
    narrative: string;
  }>;
}

export interface ImportRun {
  id: string;
  cycle_id: string;
  performed_by: string | null;
  dry_run: boolean;
  scanned_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  needs_classification_count: number;
  type_breakdown: Record<string, number>;
  rolled_back_at: string | null;
  rolled_back_count: number | null;
  created_at: string;
}

export async function fetchRecommendationKeywords(): Promise<RecommendationKeyword[]> {
  const { data, error } = await supabase
    .from('annual_review_recommendation_keywords')
    .select('id,pattern,type_key,weight,is_active,notes')
    .order('type_key', { ascending: true })
    .order('weight', { ascending: false });
  if (error) throw error;
  return (data ?? []) as RecommendationKeyword[];
}

export async function upsertRecommendationKeyword(
  input: Partial<RecommendationKeyword> & { pattern: string; type_key: string },
): Promise<void> {
  const payload = {
    pattern: input.pattern.trim(),
    type_key: input.type_key,
    weight: input.weight ?? 1,
    is_active: input.is_active ?? true,
    notes: input.notes ?? null,
  };
  const { error } = input.id
    ? await supabase
        .from('annual_review_recommendation_keywords')
        .update(payload)
        .eq('id', input.id)
    : await supabase.from('annual_review_recommendation_keywords').insert(payload);
  if (error) throw error;
}

export async function deleteRecommendationKeyword(id: string): Promise<void> {
  const { error } = await supabase
    .from('annual_review_recommendation_keywords')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function runLegacyRecommendationImport(args: {
  cycleId: string;
  dryRun: boolean;
  limit?: number;
}): Promise<ImportRunResult> {
  const { data, error } = await supabase.rpc('ar_backfill_legacy_recommendations', {
    p_cycle_id: args.cycleId,
    p_dry_run: args.dryRun,
    p_limit: args.limit ?? 5000,
  });
  if (error) throw error;
  return data as unknown as ImportRunResult;
}

export async function rollbackRecommendationImport(runId: string): Promise<number> {
  const { data, error } = await supabase.rpc('ar_rollback_recommendation_import', {
    p_run_id: runId,
  });
  if (error) throw error;
  return ((data as unknown as { deleted?: number })?.deleted ?? 0) as number;
}

export async function fetchImportRuns(cycleId: string): Promise<ImportRun[]> {
  const { data, error } = await supabase
    .from('annual_review_recommendation_import_runs')
    .select(
      'id,cycle_id,performed_by,dry_run,scanned_count,created_count,updated_count,skipped_count,needs_classification_count,type_breakdown,rolled_back_at,rolled_back_count,created_at',
    )
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  return (data ?? []) as unknown as ImportRun[];
}

export async function reclassifyRecommendation(args: {
  id: string;
  typeKeys: string[];
  amountKind?: 'absolute' | 'percent' | null;
  amountValue?: number | null;
}): Promise<void> {
  const { error } = await supabase.rpc('ar_reclassify_recommendation', {
    p_recommendation_id: args.id,
    p_type_keys: args.typeKeys,
    p_amount_kind: args.amountKind ?? undefined,
    p_amount_value: args.amountValue ?? undefined,
  });
  if (error) throw error;
}