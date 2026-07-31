import type { EligibilityCriterion } from '@/types/annualReview';
import { evaluate } from './eligibility';
import { DEFAULT_RATING_SLABS, slabCapPercent, type RatingSlab } from './ratingSlab';

/**
 * ADR-221 / POLICY §AR-ELIGIBILITY-EXEMPTION — single source of truth for the
 * *effective* eligibility of an annual review instance.
 *
 * Raw eligibility comes from the template's `sections.eligibility_criteria`
 * evaluated against `annual_review_instances.eligibility_inputs`
 * (see `lib/annualReview/eligibility.ts`). On top of that, an approved
 * exemption can waive a failing criterion — but ONLY when the master policy
 * table (`annual_review_eligibility_exemption_policy`) marks that question as
 * exemptable. Disciplinary action and the service/month-completion window are
 * never exemptable; the same rule is enforced server-side by
 * `public.ar_elig_exemption_guard()`.
 */

export type EligibilityStatus = 'eligible' | 'exempted' | 'ineligible' | 'unknown';

export const ELIGIBILITY_STATUS_LABELS: Record<EligibilityStatus, string> = {
  eligible: 'Eligible',
  exempted: 'Exempted (Eligible)',
  ineligible: 'Ineligible',
  unknown: 'Not assessed',
};

export const ELIGIBILITY_STATUS_ORDER: EligibilityStatus[] = [
  'eligible', 'exempted', 'ineligible', 'unknown',
];

export interface ExemptionPolicyRow {
  question_key: string;
  label: string;
  is_exemptable: boolean;
}

export interface ExemptionRecord {
  id?: string;
  instance_id: string;
  criterion_id: string;
  criterion_name: string;
  status: 'pending' | 'approved' | 'rejected';
  reason?: string | null;
  decision_note?: string | null;
  decided_at?: string | null;
}

export function normaliseQuestion(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A criterion is exemptable only when every matching master row allows it.
 * No matching row → not exemptable (fail closed).
 */
export function isExemptable(
  criterionName: string | null | undefined,
  policy: ReadonlyArray<ExemptionPolicyRow>,
): boolean {
  const hay = normaliseQuestion(criterionName);
  if (!hay) return false;
  const matches = policy.filter((p) => hay.includes(normaliseQuestion(p.question_key)));
  if (matches.length === 0) return false;
  return matches.every((p) => p.is_exemptable);
}

export interface EligibilityFailure {
  criterion: EligibilityCriterion;
  actual: unknown;
  /** Master-policy verdict for this question. */
  exemptable: boolean;
  /** Exemption record covering this criterion, if any. */
  exemption?: ExemptionRecord;
  /** True when an APPROVED exemption waives this failure. */
  waived: boolean;
}

export interface EffectiveEligibility {
  status: EligibilityStatus;
  /** Every criterion that failed the raw evaluation. */
  failures: EligibilityFailure[];
  /** Failures waived by an approved exemption. */
  waived: EligibilityFailure[];
  /** Failures that still block eligibility. */
  blocking: EligibilityFailure[];
  /** True when at least one exemption is awaiting a decision. */
  hasPendingExemption: boolean;
}

function coerce(actual: unknown, type: EligibilityCriterion['type']): unknown {
  if (actual === null || actual === undefined || actual === '') return actual;
  if (type === 'number') return Number(actual);
  if (type === 'boolean') return actual === true || actual === 'true' || actual === 1 || actual === '1';
  return String(actual);
}

/** Resolve the effective eligibility of one instance. */
export function resolveEligibility(args: {
  criteria: ReadonlyArray<EligibilityCriterion> | null | undefined;
  inputs: Record<string, unknown> | null | undefined;
  exemptions?: ReadonlyArray<ExemptionRecord>;
  policy?: ReadonlyArray<ExemptionPolicyRow>;
}): EffectiveEligibility {
  const { criteria, inputs, exemptions = [], policy = [] } = args;
  const empty: EffectiveEligibility = {
    status: 'unknown', failures: [], waived: [], blocking: [], hasPendingExemption: false,
  };
  if (!criteria || criteria.length === 0) return empty;

  const src = inputs ?? {};
  const byCriterion = new Map<string, ExemptionRecord>();
  for (const e of exemptions) byCriterion.set(e.criterion_id, e);

  const failures: EligibilityFailure[] = [];
  let pending = false;

  for (const c of criteria) {
    const actual = coerce(src[c.id] ?? src[c.name], c.type);
    if (evaluate(c.operator, actual, c.expected_value)) continue;
    const exemption = byCriterion.get(c.id);
    const exemptable = isExemptable(c.name, policy);
    if (exemption?.status === 'pending') pending = true;
    failures.push({
      criterion: c,
      actual,
      exemptable,
      exemption,
      waived: exemptable && exemption?.status === 'approved',
    });
  }

  const waived = failures.filter((f) => f.waived);
  const blocking = failures.filter((f) => !f.waived);
  const status: EligibilityStatus =
    blocking.length > 0 ? 'ineligible'
      : waived.length > 0 ? 'exempted'
        : 'eligible';

  return { status, failures, waived, blocking, hasPendingExemption: pending };
}

/** Short summary such as `Ineligible (Absent Days)` for grids and exports. */
export function eligibilitySummary(r: EffectiveEligibility): string {
  if (r.status === 'unknown') return '—';
  if (r.status === 'eligible') return ELIGIBILITY_STATUS_LABELS.eligible;
  const names = (r.status === 'ineligible' ? r.blocking : r.waived)
    .map((f) => f.criterion.name.trim())
    .join(', ');
  return `${ELIGIBILITY_STATUS_LABELS[r.status]}${names ? ` (${names})` : ''}`;
}

/**
 * POLICY §AR-ELIGIBILITY-EXEMPTION (decision A) — an ineligible employee's
 * increment slab is displayed as 0%, regardless of the computed rating.
 *
 * ADR-222 / decision B — an employee made eligible through an approved
 * exemption may not receive the top `topTiersExcluded` increment tiers; their
 * percentage is clamped down to the highest remaining band (never raised).
 */
export interface SlabCapOptions {
  slabs?: ReadonlyArray<RatingSlab>;
  capEnabled?: boolean;
  topTiersExcluded?: number;
}

export function effectiveSlabPercent(
  computedPercent: number | null,
  status: EligibilityStatus,
  options?: SlabCapOptions,
): number | null {
  if (status === 'ineligible') return 0;
  if (status !== 'exempted') return computedPercent;
  if (!options?.capEnabled) return computedPercent;
  if (computedPercent === null || computedPercent === undefined) return computedPercent;
  const cap = slabCapPercent(options.slabs ?? DEFAULT_RATING_SLABS, options.topTiersExcluded ?? 0);
  return Math.min(computedPercent, cap);
}

/** True when the exemption cap actually reduced the computed percentage. */
export function isSlabCapped(
  computedPercent: number | null,
  status: EligibilityStatus,
  options?: SlabCapOptions,
): boolean {
  if (computedPercent === null || computedPercent === undefined) return false;
  const eff = effectiveSlabPercent(computedPercent, status, options);
  return status === 'exempted' && eff !== null && eff < computedPercent;
}