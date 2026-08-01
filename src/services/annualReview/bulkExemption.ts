import { supabase } from '@/integrations/supabase/client';
import type { EligibilityCriterion } from '@/types/annualReview';
import { evaluate } from '@/lib/annualReview/eligibility';
import {
  isExemptable, normaliseQuestion,
  type EffectiveEligibility, type ExemptionPolicyRow,
} from '@/lib/annualReview/effectiveEligibility';

/**
 * ADR-224 / POLICY §AR-ELIGIBILITY-EXEMPTION — bulk exemption of one
 * eligibility criterion across a cycle.
 *
 * The preview is client-side (so the numbers match the grid exactly) but the
 * apply path always re-evaluates server-side in
 * `bulk_exempt_eligibility_criterion`; the client list is never trusted.
 */

export type BulkOperator = 'lte' | 'lt' | 'gte' | 'gt' | 'equals';

export const BULK_OPERATOR_LABELS: Record<BulkOperator, string> = {
  lte: 'is at most (≤)',
  lt: 'is less than (<)',
  gte: 'is at least (≥)',
  gt: 'is greater than (>)',
  equals: 'equals',
};

export interface BulkExemptionCandidate {
  instance_id: string;
  employee_id: string | null;
  employee_code: string | null;
  employee_name: string | null;
  criterion_name: string;
  actual: string;
  otherFailures: number;
}

export interface BulkPreviewRow {
  instance_id: string;
  employee_id: string | null;
  criterion_name: string;
  actual: string | null;
  action: string;
  message: string | null;
}

export interface BulkExemptionRun {
  id: string;
  cycle_id: string;
  criterion_key: string;
  criterion_label: string | null;
  operator: string;
  threshold: string | null;
  only_sole_failure: boolean;
  reason: string;
  matched_count: number;
  applied_count: number;
  status: string;
  performed_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

/** Distinct exemptable criteria present in the loaded template maps. */
export function exemptableCriteria(
  maps: Record<string, EligibilityCriterion[] | undefined>,
  policy: ReadonlyArray<ExemptionPolicyRow>,
): EligibilityCriterion[] {
  const byId = new Map<string, EligibilityCriterion>();
  for (const list of Object.values(maps)) {
    for (const c of list ?? []) {
      if (!isExemptable(c.name, policy)) continue;
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function coerce(actual: unknown, type: EligibilityCriterion['type']): unknown {
  if (actual === null || actual === undefined || actual === '') return actual;
  if (type === 'number') return Number(actual);
  if (type === 'boolean') return actual === true || actual === 'true' || actual === 1 || actual === '1';
  return String(actual);
}

/**
 * Does this instance qualify for the bulk exemption?
 * Requires: the criterion actually failed, its value satisfies the admin
 * threshold, and (optionally) it is the only blocking failure.
 */
export function matchesBulkRule(args: {
  eligibility: EffectiveEligibility;
  criterionId: string;
  operator: BulkOperator;
  threshold: string;
  onlySoleFailure: boolean;
}): { matched: boolean; criterionName?: string; actual?: string; otherFailures: number } {
  const { eligibility, criterionId, operator, threshold, onlySoleFailure } = args;
  const target = eligibility.blocking.find((f) => f.criterion.id === criterionId);
  const otherFailures = eligibility.blocking.filter((f) => f.criterion.id !== criterionId).length;
  if (!target) return { matched: false, otherFailures };
  if (!target.exemptable) return { matched: false, otherFailures };
  if (onlySoleFailure && otherFailures > 0) {
    return { matched: false, criterionName: target.criterion.name, otherFailures };
  }
  const type = target.criterion.type;
  const ok = evaluate(operator, coerce(target.actual, type), coerce(threshold, type));
  return {
    matched: ok,
    criterionName: target.criterion.name,
    actual: target.actual === null || target.actual === undefined ? '' : String(target.actual),
    otherFailures,
  };
}

export async function applyBulkExemption(args: {
  cycleId: string;
  criterionId: string;
  operator: BulkOperator;
  threshold: string;
  onlySoleFailure: boolean;
  reason: string;
  dryRun?: boolean;
}): Promise<BulkPreviewRow[]> {
  const { data, error } = await (supabase as any).rpc('bulk_exempt_eligibility_criterion', {
    p_cycle_id: args.cycleId,
    p_criterion_id: args.criterionId,
    p_operator: args.operator,
    p_threshold: args.threshold,
    p_only_sole_failure: args.onlySoleFailure,
    p_reason: args.reason,
    p_dry_run: args.dryRun ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as BulkPreviewRow[];
}

export async function fetchBulkExemptionRuns(cycleId: string): Promise<BulkExemptionRun[]> {
  const { data, error } = await (supabase as any)
    .from('annual_review_bulk_exemption_runs')
    .select('id, cycle_id, criterion_key, criterion_label, operator, threshold, only_sole_failure, reason, matched_count, applied_count, status, performed_by, created_at, revoked_at')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as BulkExemptionRun[];
}

export async function revokeBulkExemptionRun(runId: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc('revoke_bulk_exemption_run', { p_run_id: runId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** Match key helper reused by tests. */
export { normaliseQuestion };