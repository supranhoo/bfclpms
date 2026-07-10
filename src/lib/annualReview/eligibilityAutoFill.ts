import type { EligibilityCriterion } from '@/types/annualReview';

/**
 * Auto-derive eligibility inputs that the system can compute without HR entry.
 *
 * Currently supports service-tenure / month-completion criteria, evaluated as
 * "months of service as on 30-June of the review year" (fiscal year end).
 * A criterion is recognised as tenure-based when its name/description mentions
 * `service`, `tenure`, `month completion`, or `months of service`.
 *
 * Auto-derived values are DISPLAY OVERRIDES only — they are never persisted
 * into `annual_review_instances.eligibility_inputs`. HR-entered values in the
 * persisted map always win. See POLICY §AR-ELIGIBILITY-AUTOFILL.
 */

const TENURE_HINTS = [
  'service',
  'tenure',
  'month completion',
  'months of service',
  'months completed',
  'completion as on',
];

function isTenureCriterion(c: EligibilityCriterion): boolean {
  const hay = `${c.name ?? ''} ${c.description ?? ''}`.toLowerCase();
  return TENURE_HINTS.some((h) => hay.includes(h));
}

/** Whole months between two YYYY-MM-DD anchored dates (calendar-based). */
export function monthsBetween(fromISO: string, toISO: string): number {
  const f = new Date(fromISO);
  const t = new Date(toISO);
  if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return 0;
  let months = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
  if (t.getDate() < f.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * @param criteria template eligibility criteria
 * @param doj employee date of joining (ISO string) or null
 * @param reviewYear the cycle's `review_year` (e.g. 2026 → cycle 2025-26, FY end = 30-Jun-2026)
 */
export function deriveAutoInputs(
  criteria: EligibilityCriterion[] | undefined | null,
  doj: string | null | undefined,
  reviewYear: number | null | undefined,
): Record<string, number> {
  if (!criteria?.length || !doj || !reviewYear) return {};
  const cycleEnd = `${reviewYear}-06-30`;
  const months = monthsBetween(doj, cycleEnd);
  const out: Record<string, number> = {};
  for (const c of criteria) {
    if (c.type !== 'number') continue;
    if (!isTenureCriterion(c)) continue;
    out[c.id] = months;
  }
  return out;
}

/** Merge auto-derived inputs UNDER manually-entered inputs (manual wins). */
export function mergeInputs(
  manual: Record<string, unknown> | undefined | null,
  auto: Record<string, number>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...auto };
  if (manual) {
    for (const [k, v] of Object.entries(manual)) {
      if (v !== undefined && v !== null && v !== '') merged[k] = v;
    }
  }
  return merged;
}