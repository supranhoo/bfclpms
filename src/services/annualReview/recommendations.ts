/**
 * ADR-226 — Annual Review structured recommendation tracking (service layer).
 *
 * POLICY §AR-RECOMMENDATION-TRACKING:
 *  - Capture of a recommendation is stage-scoped: only the named reviewer for
 *    that stage (dept_head / bu_head / management) may write it, enforced by
 *    `ar_save_recommendation` (SECURITY DEFINER) — never by the client.
 *  - Decisions (approve / modify / reject / defer / implement) are HR, Management
 *    or Admin only and are always audited in `annual_review_access_audit`.
 *  - No business rule is hardcoded in the UI: recommendation types are master
 *    data in `annual_review_recommendation_types`.
 */
import { supabase } from '@/integrations/supabase/client';
import type { AnnualReviewerRole } from '@/types/annualReview';

export type RecommendationAmountKind = 'absolute' | 'percent';

export type RecommendationStatus =
  | 'draft'
  | 'submitted'
  | 'needs_classification'
  | 'approved'
  | 'approved_modified'
  | 'rejected'
  | 'deferred'
  | 'implemented';

export const RECOMMENDATION_STATUS_LABEL: Record<RecommendationStatus, string> = {
  draft: 'Draft',
  submitted: 'Pending decision',
  needs_classification: 'Needs classification',
  approved: 'Approved',
  approved_modified: 'Approved (modified)',
  rejected: 'Rejected',
  deferred: 'Deferred',
  implemented: 'Implemented',
};

export interface RecommendationType {
  id: string;
  key: string;
  label: string;
  is_monetary: boolean;
  requires_amount: boolean;
  requires_target_role: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface RecommendationRecord {
  id: string;
  instance_id: string;
  cycle_id: string;
  employee_id: string;
  reviewer_id: string | null;
  reviewer_role: AnnualReviewerRole;
  amount_kind: RecommendationAmountKind | null;
  amount_value: number | null;
  proposed_designation_id: string | null;
  proposed_grade_id: string | null;
  effective_from: string | null;
  narrative: string | null;
  source: 'stage_form' | 'legacy_import';
  status: RecommendationStatus;
  approved_amount_kind: RecommendationAmountKind | null;
  approved_amount_value: number | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  created_at: string;
  updated_at: string;
  type_keys?: string[];
}

export interface RecommendationQueueRow {
  id: string;
  instance_id: string;
  employee_id: string;
  employee_code: string | null;
  employee_name: string | null;
  department_name: string | null;
  business_unit_name: string | null;
  designation_name: string | null;
  reviewer_role: AnnualReviewerRole;
  reviewer_name: string | null;
  type_keys: string[] | null;
  type_labels: string[] | null;
  is_monetary: boolean | null;
  amount_kind: RecommendationAmountKind | null;
  amount_value: number | null;
  approved_amount_kind: RecommendationAmountKind | null;
  approved_amount_value: number | null;
  proposed_designation: string | null;
  proposed_grade: string | null;
  effective_from: string | null;
  narrative: string | null;
  status: RecommendationStatus;
  source: 'stage_form' | 'legacy_import';
  decided_at: string | null;
  decision_reason: string | null;
  final_rating: string | null;
  total_score: number | null;
  created_at: string;
  total_count: number;
}

export async function fetchRecommendationTypes(): Promise<RecommendationType[]> {
  const { data, error } = await supabase
    .from('annual_review_recommendation_types')
    .select('id,key,label,is_monetary,requires_amount,requires_target_role,is_active,sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as RecommendationType[];
}

/** All recommendations captured on one review instance (any stage). */
export async function fetchInstanceRecommendations(
  instanceId: string,
): Promise<RecommendationRecord[]> {
  const { data, error } = await supabase
    .from('annual_review_recommendations')
    .select('*, annual_review_recommendation_items(type_id)')
    .eq('instance_id', instanceId);
  if (error) throw error;

  const types = await fetchRecommendationTypes();
  const byId = new Map(types.map((t) => [t.id, t.key]));
  return (data ?? []).map((row: Record<string, unknown>) => ({
    ...(row as unknown as RecommendationRecord),
    type_keys: ((row.annual_review_recommendation_items as { type_id: string }[]) ?? [])
      .map((i) => byId.get(i.type_id))
      .filter((k): k is string => !!k),
  }));
}

export interface SaveRecommendationInput {
  instanceId: string;
  reviewerRole: AnnualReviewerRole;
  typeKeys: string[];
  amountKind?: RecommendationAmountKind | null;
  amountValue?: number | null;
  designationId?: string | null;
  gradeId?: string | null;
  effectiveFrom?: string | null;
  narrative?: string | null;
}

export async function saveRecommendation(input: SaveRecommendationInput): Promise<string> {
  const { data, error } = await supabase.rpc('ar_save_recommendation', {
    p_instance_id: input.instanceId,
    p_reviewer_role: input.reviewerRole,
    p_type_keys: input.typeKeys,
    p_amount_kind: input.amountKind ?? undefined,
    p_amount_value: input.amountValue ?? undefined,
    p_designation_id: input.designationId ?? undefined,
    p_grade_id: input.gradeId ?? undefined,
    p_effective_from: input.effectiveFrom ?? undefined,
    p_narrative: input.narrative ?? undefined,
  });
  if (error) throw error;
  return data as string;
}

export async function decideRecommendation(args: {
  id: string;
  status: RecommendationStatus;
  reason: string;
  approvedAmountKind?: RecommendationAmountKind | null;
  approvedAmountValue?: number | null;
}): Promise<void> {
  const { error } = await supabase.rpc('ar_decide_recommendation', {
    p_recommendation_id: args.id,
    p_status: args.status,
    p_reason: args.reason,
    p_approved_amount_kind: args.approvedAmountKind ?? undefined,
    p_approved_amount_value: args.approvedAmountValue ?? undefined,
  });
  if (error) throw error;
}

export async function bulkDecideRecommendations(args: {
  ids: string[];
  status: RecommendationStatus;
  reason: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc('ar_bulk_decide_recommendations', {
    p_recommendation_ids: args.ids,
    p_status: args.status,
    p_reason: args.reason,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export interface RecommendationQueueFilters {
  cycleId: string;
  status?: RecommendationStatus | null;
  typeKey?: string | null;
  monetaryOnly?: boolean;
  search?: string | null;
  /** ADR-226 Phase 2 — distinguish stage-form captures from legacy imports. */
  source?: 'stage_form' | 'legacy_import' | null;
  /** Server-side pagination is mandatory for this queue (POLICY §13). */
  page: number;
  pageSize: number;
}

export async function fetchRecommendationQueue(
  f: RecommendationQueueFilters,
): Promise<{ rows: RecommendationQueueRow[]; total: number }> {
  const { data, error } = await supabase.rpc('ar_recommendation_queue', {
    p_cycle_id: f.cycleId,
    p_status: f.status ?? undefined,
    p_type_key: f.typeKey ?? undefined,
    p_monetary_only: f.monetaryOnly ?? false,
    p_search: f.search ?? undefined,
    p_limit: f.pageSize,
    p_offset: f.page * f.pageSize,
    p_source: f.source ?? undefined,
  });
  if (error) throw error;
  const rows = (data ?? []) as unknown as RecommendationQueueRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/** Human-readable amount, e.g. "₹5,000" or "8%". Returns "—" when unset. */
export function formatRecommendationAmount(
  kind: RecommendationAmountKind | null | undefined,
  value: number | null | undefined,
): string {
  if (value == null || kind == null) return '—';
  return kind === 'percent'
    ? `${Number(value).toFixed(2).replace(/\.00$/, '')}%`
    : `₹${Number(value).toLocaleString('en-IN')}`;
}
