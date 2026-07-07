/**
 * Raw → Rating → Points scorer for Annual Review System KPIs.
 *
 * The KPI Library defines `scoring_rules` (direction + bands). Each template's
 * `system_scores[]` slot copies those bands + the resolved `weight_pct`.
 *
 * HR keys in a *raw* measurement (e.g. LTI = 0, 5S = 82). This function turns
 * that raw value into two derived numbers:
 *   - `rating`  → 0..scale (default 5), the band the raw value falls into.
 *   - `points`  → `rating / scale * weight` — what lands in `system_scores`.
 *
 * When `bands` is empty the value is treated as pre-scaled points (legacy path
 * used by `carry_kra` and templates authored before bands existed).
 *
 * POLICY §AR-SYSTEM-KPI-RAW-INPUT.
 */

export interface ScoringBand { score: number; threshold: number }
export interface ScoringRules {
  direction: 'higher_better' | 'lower_better';
  bands: ScoringBand[];
}

export const DEFAULT_SCALE = 5;

export interface ScoreResult {
  /** Rating on 0..scale — the band the raw value matched. */
  rating: number;
  /** Scaled contribution in weight-percentage points. */
  points: number;
  /** True when a band matched; false when raw fell outside every band. */
  matched: boolean;
  /** Scale used (usually 5). */
  scale: number;
}

/**
 * Pick the band whose threshold matches `raw` given the direction.
 * Bands are sorted highest→lowest score.
 */
export function pickBand(raw: number, rules: ScoringRules): ScoringBand | null {
  const bands = [...(rules.bands ?? [])].sort((a, b) => b.score - a.score);
  if (bands.length === 0) return null;
  if (rules.direction === 'lower_better') {
    // Best score is the smallest threshold; pick highest score whose threshold >= raw.
    for (const b of bands) {
      if (raw <= b.threshold) return b;
    }
    return bands[bands.length - 1]; // worst
  }
  // higher_better — pick highest score whose threshold <= raw.
  for (const b of bands) {
    if (raw >= b.threshold) return b;
  }
  return bands[bands.length - 1]; // worst
}

/**
 * Convert a raw HR-entered value into a rating (0..scale) and weight-scaled
 * contribution points. When `rules.bands` is empty, `raw` is clamped into
 * `[0, weight]` and returned as `points` unchanged (legacy behavior).
 */
export function scoreFromRaw(
  raw: number,
  rules: ScoringRules | null | undefined,
  weight: number,
  scale: number = DEFAULT_SCALE,
): ScoreResult {
  const w = Number.isFinite(weight) ? Math.max(0, Number(weight)) : 0;
  const s = scale > 0 ? scale : DEFAULT_SCALE;
  const rawN = Number(raw);

  if (!rules || !rules.bands || rules.bands.length === 0) {
    // No bands — treat raw as pre-scaled points.
    const clamped = Number.isFinite(rawN) ? Math.max(0, Math.min(w, rawN)) : 0;
    return { rating: w > 0 ? (clamped / w) * s : 0, points: clamped, matched: false, scale: s };
  }

  if (!Number.isFinite(rawN)) {
    return { rating: 0, points: 0, matched: false, scale: s };
  }

  const band = pickBand(rawN, rules);
  const rating = band ? Math.max(0, Math.min(s, band.score)) : 0;
  const points = w > 0 ? (rating / s) * w : 0;
  return { rating, points, matched: !!band, scale: s };
}
