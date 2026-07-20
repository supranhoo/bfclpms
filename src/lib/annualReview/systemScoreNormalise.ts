/**
 * ADR-127 — Normalise a stored System Score value to weight-scaled points.
 *
 * `annual_review_instances.system_scores[slot_id]` is *supposed* to hold
 * weight-scaled points (i.e. bounded by the slot's `weight`). Historically
 * some writer paths (safety/hr/env carry) pushed the raw 0..5 rating in
 * instead, and the template snapshot doesn't always include
 * `scoring_rules.bands`, so the read side had no way to re-derive points.
 *
 * SSOT rule (POLICY §AR-SYSTEM-SCORE-SCALE):
 *   - If the slot has scoring bands AND a raw measurement is present →
 *     recompute points via `scoreFromRaw` (authoritative).
 *   - Else if the stored value looks like a 0..5 rating that overflows
 *     the slot weight (`stored > weight` AND `stored ≤ 5` AND `weight < 5`) →
 *     rescale as `(stored / 5) × weight`.
 *   - Else → clamp to `[0, weight]` (legacy pre-scaled-points path).
 *
 * Pure — covered by systemScoreNormalise.test.ts.
 */
import type { TemplateSystemScore } from '@/types/annualReview';
import { scoreFromRaw, DEFAULT_SCALE } from './systemKpiScoring';

export function normaliseSystemScoreValue(
  slot: Pick<TemplateSystemScore, 'weight' | 'scoring_rules'>,
  stored: number | undefined | null,
  rawMeasurement: number | undefined | null,
): number {
  const weight = Number.isFinite(slot?.weight as number) ? Math.max(0, Number(slot.weight)) : 0;
  if (weight <= 0) return 0;

  const bands = slot?.scoring_rules?.bands ?? [];
  if (bands.length > 0 && rawMeasurement != null && Number.isFinite(Number(rawMeasurement))) {
    return Number(
      scoreFromRaw(Number(rawMeasurement), slot.scoring_rules!, weight).points.toFixed(4),
    );
  }

  const v = Number(stored);
  if (!Number.isFinite(v)) return 0;

  // Rating-stored-in-points-slot heuristic. Only fires when the stored value
  // is >weight (overflow) AND fits within the 0..5 rating scale AND the slot
  // weight itself is smaller than the scale (so it can never legitimately
  // hold a rating). Applies to safety/hr/env slots with weight 2..4.
  if (v > weight && v <= DEFAULT_SCALE && weight < DEFAULT_SCALE) {
    return Number(((v / DEFAULT_SCALE) * weight).toFixed(4));
  }

  return Math.max(0, Math.min(weight, v));
}

/**
 * Convenience wrapper — normalise an entire persisted map against the
 * template's `system_scores[]` slot list, using `system_scores_raw` for
 * the raw measurement lookup.
 */
export function normaliseSystemScoreMap(
  slots: TemplateSystemScore[] | null | undefined,
  stored: Record<string, number> | null | undefined,
  raw: Record<string, number> | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = { ...(stored ?? {}) };
  for (const s of slots ?? []) {
    out[s.id] = normaliseSystemScoreValue(s, stored?.[s.id], raw?.[s.id]);
  }
  return out;
}