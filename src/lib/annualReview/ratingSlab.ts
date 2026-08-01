/**
 * ADR-212 / POLICY §AR-RATING-SLAB
 *
 * Single source of truth for converting an annual review Final Score
 * (`annual_review_instances.total_score`, guaranteed 0..100 by ADR-187) into a
 * 5-point rating, and for resolving the increment slab percentage from that
 * rating against admin-configured bands.
 *
 * Band matching is half-open `[rating_from, rating_to)` so an exact boundary
 * value always falls into the HIGHER slab (2.00 -> 4%, 3.00 -> 8%, 4.50 -> 20%).
 * `rating_to === null` means an open-ended top band.
 */

export interface RatingSlab {
  id?: string;
  rating_from: number;
  rating_to: number | null;
  increment_percent: number;
  sort_order?: number | null;
  is_active?: boolean | null;
}

/** Default bands, mirroring the seeded rows in `annual_review_rating_slabs`. */
export const DEFAULT_RATING_SLABS: ReadonlyArray<RatingSlab> = [
  { rating_from: 0, rating_to: 2, increment_percent: 0, sort_order: 1 },
  { rating_from: 2, rating_to: 2.5, increment_percent: 4, sort_order: 2 },
  { rating_from: 2.5, rating_to: 3, increment_percent: 6, sort_order: 3 },
  { rating_from: 3, rating_to: 3.5, increment_percent: 8, sort_order: 4 },
  { rating_from: 3.5, rating_to: 4, increment_percent: 12, sort_order: 5 },
  { rating_from: 4, rating_to: 4.5, increment_percent: 16, sort_order: 6 },
  { rating_from: 4.5, rating_to: null, increment_percent: 20, sort_order: 7 },
];

/** Final score (0..100) -> rating out of 5, rounded to 2 dp. Null-safe. */
export function toRatingOutOf5(totalScore: number | null | undefined): number | null {
  if (totalScore === null || totalScore === undefined) return null;
  if (!Number.isFinite(totalScore)) return null;
  return Math.round((totalScore / 20) * 100) / 100;
}

/** Display helper — `4.25` or `—`. */
export function formatRating5(rating: number | null | undefined): string {
  return rating === null || rating === undefined || !Number.isFinite(rating)
    ? '—'
    : rating.toFixed(2);
}

/** Resolve the matching slab for a rating. Returns null when unresolvable. */
export function resolveSlab(
  rating: number | null | undefined,
  slabs: ReadonlyArray<RatingSlab> = DEFAULT_RATING_SLABS,
): RatingSlab | null {
  if (rating === null || rating === undefined || !Number.isFinite(rating)) return null;
  const active = slabs
    .filter((s) => s.is_active !== false)
    .slice()
    .sort((a, b) => a.rating_from - b.rating_from);
  for (const s of active) {
    const upperOk = s.rating_to === null || s.rating_to === undefined || rating < s.rating_to;
    if (rating >= s.rating_from && upperOk) return s;
  }
  return null;
}

/** Resolve just the percentage. Null when no score / no matching band. */
export function resolveSlabPercent(
  rating: number | null | undefined,
  slabs: ReadonlyArray<RatingSlab> = DEFAULT_RATING_SLABS,
): number | null {
  const slab = resolveSlab(rating, slabs);
  return slab ? Number(slab.increment_percent) : null;
}

/** Display helper — `12%` or `—`. */
export function formatSlabPercent(pct: number | null | undefined): string {
  return pct === null || pct === undefined || !Number.isFinite(pct) ? '—' : `${pct}%`;
}

/**
 * ADR-222 / POLICY §AR-ELIGIBILITY-EXEMPTION (decision B) — the highest
 * increment percentage still available once the top `topTiersExcluded` active
 * bands are removed from the scale. Returns 0 when every band is excluded.
 */
export function slabCapPercent(
  slabs: ReadonlyArray<RatingSlab> = DEFAULT_RATING_SLABS,
  topTiersExcluded = 0,
): number {
  const n = Number.isFinite(topTiersExcluded) ? Math.max(0, Math.trunc(topTiersExcluded)) : 0;
  const active = slabs
    .filter((s) => s.is_active !== false)
    .slice()
    .sort((a, b) => a.rating_from - b.rating_from);
  if (active.length === 0) return 0;
  const remaining = n >= active.length ? [] : active.slice(0, active.length - n);
  if (remaining.length === 0) return 0;
  return Math.max(...remaining.map((s) => Number(s.increment_percent) || 0));
}

/** Human-readable band label, e.g. "3.50 – under 4.00" / "4.50 and above". */
export function describeSlab(slab: RatingSlab): string {
  return slab.rating_to === null || slab.rating_to === undefined
    ? `${slab.rating_from.toFixed(2)} and above`
    : `${slab.rating_from.toFixed(2)} – under ${Number(slab.rating_to).toFixed(2)}`;
}

/**
 * ADR-224 / POLICY §AR-ELIGIBILITY-EXEMPTION (decision C) — the exemption
 * penalty is master data, not a hardcoded clamp.
 *
 * - `none`               — an exempted employee keeps the computed percentage.
 * - `top_tiers_excluded` — legacy ADR-222 behaviour: clamp down to the highest
 *                          band left once the top N bands are removed.
 * - `step_down`          — move the employee N slabs DOWN from whatever slab
 *                          they landed in (default scope: every slab).
 *
 * The penalty can only ever reduce a percentage, never raise it.
 */
export type ExemptionPenaltyMode = 'none' | 'top_tiers_excluded' | 'step_down';
export type ExemptionPenaltyScope = 'all_slabs' | 'top_slabs_only';

export interface ExemptionPenaltyRule {
  mode?: ExemptionPenaltyMode;
  /** `step_down` — number of slabs to drop. */
  stepDownSlabs?: number;
  /** `top_tiers_excluded` — number of top bands removed from the scale. */
  topTiersExcluded?: number;
  /** Which employees the penalty applies to. Default: every slab. */
  scope?: ExemptionPenaltyScope;
  /** `top_slabs_only` — how many slabs count as "top". */
  topSlabs?: number;
  /** Lowest percentage the penalty may reach. */
  floorPercent?: number;
}

export interface ExemptionPenaltyResult {
  percent: number | null;
  applied: boolean;
  mode: ExemptionPenaltyMode;
  from: number | null;
  to: number | null;
  slabsMoved: number;
}

function activeSorted(slabs: ReadonlyArray<RatingSlab>): RatingSlab[] {
  return slabs
    .filter((s) => s.is_active !== false)
    .slice()
    .sort((a, b) => a.rating_from - b.rating_from);
}

/** Resolve the index of the band that owns `percent` (highest match). */
function indexForPercent(active: RatingSlab[], percent: number): number {
  let idx = -1;
  active.forEach((s, i) => {
    if (Number(s.increment_percent) === percent) idx = i;
  });
  if (idx >= 0) return idx;
  // Not an exact band value — fall back to the highest band at or below it.
  for (let i = active.length - 1; i >= 0; i -= 1) {
    if (Number(active[i].increment_percent) <= percent) return i;
  }
  return 0;
}

export function applyExemptionPenalty(
  computedPercent: number | null | undefined,
  slabs: ReadonlyArray<RatingSlab> = DEFAULT_RATING_SLABS,
  rule: ExemptionPenaltyRule = {},
): ExemptionPenaltyResult {
  const mode: ExemptionPenaltyMode = rule.mode ?? 'top_tiers_excluded';
  const from = computedPercent === null || computedPercent === undefined || !Number.isFinite(computedPercent)
    ? null
    : Number(computedPercent);
  const none: ExemptionPenaltyResult = {
    percent: from, applied: false, mode, from, to: from, slabsMoved: 0,
  };
  if (from === null || mode === 'none') return none;

  const active = activeSorted(slabs);
  if (active.length === 0) return none;

  const floor = Number.isFinite(rule.floorPercent) ? Number(rule.floorPercent) : 0;

  if (mode === 'top_tiers_excluded') {
    const cap = slabCapPercent(active, rule.topTiersExcluded ?? 0);
    const to = Math.max(floor, Math.min(from, cap));
    return { percent: to, applied: to < from, mode, from, to, slabsMoved: 0 };
  }

  // step_down
  const idx = indexForPercent(active, from);
  if (rule.scope === 'top_slabs_only') {
    const topN = Math.max(0, Math.trunc(rule.topSlabs ?? 2));
    if (idx < active.length - topN) return none;
  }
  const steps = Math.max(0, Math.trunc(rule.stepDownSlabs ?? 1));
  if (steps === 0) return none;
  const targetIdx = Math.max(0, idx - steps);
  const raw = Number(active[targetIdx].increment_percent) || 0;
  const to = Math.max(floor, Math.min(from, raw));
  return { percent: to, applied: to < from, mode, from, to, slabsMoved: idx - targetIdx };
}

/** Human sentence for the transparency popover / exports. */
export function describeExemptionPenalty(r: ExemptionPenaltyResult): string {
  if (!r.applied || r.from === null || r.to === null) return 'No exemption penalty applied';
  if (r.mode === 'step_down') {
    return `Exemption penalty: ${r.slabsMoved} slab${r.slabsMoved === 1 ? '' : 's'} down — ${r.from}% → ${r.to}%`;
  }
  return `Exemption penalty: top increment tiers excluded — ${r.from}% → ${r.to}%`;
}

export interface SlabValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Guardrail for the admin editor: bands must be ordered, contiguous (no gaps),
 * non-overlapping, and end with exactly one open-ended top band.
 */
export function validateSlabBands(slabs: ReadonlyArray<RatingSlab>): SlabValidationResult {
  const errors: string[] = [];
  const active = slabs.filter((s) => s.is_active !== false);
  if (active.length === 0) return { valid: false, errors: ['At least one active slab is required.'] };

  const sorted = active.slice().sort((a, b) => a.rating_from - b.rating_from);

  for (const s of sorted) {
    if (!Number.isFinite(s.rating_from)) errors.push('Every slab needs a numeric "from" rating.');
    if (!Number.isFinite(s.increment_percent)) errors.push('Every slab needs a numeric increment percent.');
    if (s.rating_to !== null && s.rating_to !== undefined && s.rating_to <= s.rating_from) {
      errors.push(`Slab starting at ${s.rating_from} has a "to" value that is not greater than its "from" value.`);
    }
  }

  const openEnded = sorted.filter((s) => s.rating_to === null || s.rating_to === undefined);
  if (openEnded.length !== 1) {
    errors.push('Exactly one slab must be open-ended (blank "to" value) to cover the top of the scale.');
  } else if (sorted[sorted.length - 1] !== openEnded[0]) {
    errors.push('The open-ended slab must be the highest band.');
  }

  for (let i = 1; i < sorted.length; i++) {
    const prevTo = sorted[i - 1].rating_to;
    if (prevTo === null || prevTo === undefined) continue;
    if (sorted[i].rating_from < prevTo) {
      errors.push(`Bands overlap between ${sorted[i - 1].rating_from} and ${sorted[i].rating_from}.`);
    } else if (sorted[i].rating_from > prevTo) {
      errors.push(`Gap in bands between ${prevTo} and ${sorted[i].rating_from}.`);
    }
  }

  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
}