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