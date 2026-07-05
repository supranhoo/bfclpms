import type { Json } from '@/integrations/supabase/types';
import type { CriterionOption } from '@/types/annualReview';

/**
 * SSOT: convert a criterion's `scoring_bands` (JSONB) + `max_score` into the
 * `CriterionOption[]` shape the reviewer form (`CriteriaScoringMatrix`) reads.
 *
 * Accepts any of the shapes produced by the workbook importer or the manual
 * editor:
 *   [{ score:5, label:"…" }]
 *   [{ score:5, label_en:"…", label_hi:"…" }]
 *   [{ score:5, label:"EN / HI" }]
 *
 * When `bands` is empty / malformed, falls back to a plain 0..maxScore ladder
 * with generic English labels so the form still renders clickable buttons
 * (never leaves the reviewer with a scoreless question).
 */
export interface ScoringBand {
  score: number;
  label_en: string;
  label_hi?: string | null;
}

const DEFAULT_LADDER: Record<number, string> = {
  5: 'Outstanding',
  4: 'Above target',
  3: 'On target',
  2: 'Below target',
  1: 'Well below target',
  0: 'Not achieved',
};

function coerceBand(raw: unknown): ScoringBand | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const score = Number(o.score);
  if (!Number.isFinite(score)) return null;
  const rawLabel =
    typeof o.label_en === 'string' ? o.label_en :
    typeof o.label === 'string' ? o.label :
    typeof o.text === 'string' ? o.text : '';
  let labelEn = rawLabel;
  let labelHi = typeof o.label_hi === 'string' ? o.label_hi : null;
  // "EN / HI" split when label carries both.
  if (!labelHi && rawLabel.includes(' / ')) {
    const [en, hi] = rawLabel.split(' / ');
    labelEn = en.trim();
    labelHi = (hi ?? '').trim() || null;
  }
  if (!labelEn) labelEn = DEFAULT_LADDER[score] ?? `Score ${score}`;
  return { score, label_en: labelEn, label_hi: labelHi };
}

export function parseScoringBands(raw: Json | null | undefined): ScoringBand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(coerceBand)
    .filter((b): b is ScoringBand => b !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Convert bands into the `CriterionOption[]` the reviewer form expects.
 * Bands beyond the criterion's `max_score` are dropped; missing scores in the
 * `0..maxScore` range are filled from the default ladder so buttons always
 * render.
 */
export function bandsToOptions(
  bandsRaw: Json | null | undefined,
  maxScore: number,
): CriterionOption[] {
  const max = Number.isFinite(maxScore) && maxScore > 0 ? Math.floor(maxScore) : 5;
  const bands = parseScoringBands(bandsRaw).filter((b) => b.score >= 0 && b.score <= max);
  const byScore = new Map<number, ScoringBand>();
  for (const b of bands) byScore.set(b.score, b);
  const out: CriterionOption[] = [];
  for (let s = max; s >= 0; s--) {
    const band = byScore.get(s);
    const labelEn = band?.label_en ?? DEFAULT_LADDER[s] ?? `Score ${s}`;
    out.push({ id: `o${s}`, score: s, label: labelEn });
  }
  return out;
}

/**
 * Bilingual variant: also returns `label_hi` per option so the i18n context
 * can register both languages. Kept separate from `bandsToOptions` because
 * `CriterionOption` in `types/annualReview.ts` does not carry `label_hi` yet.
 */
export function bandsToBilingualOptions(
  bandsRaw: Json | null | undefined,
  maxScore: number,
): Array<CriterionOption & { label_hi?: string | null }> {
  const max = Number.isFinite(maxScore) && maxScore > 0 ? Math.floor(maxScore) : 5;
  const bands = parseScoringBands(bandsRaw).filter((b) => b.score >= 0 && b.score <= max);
  const byScore = new Map<number, ScoringBand>();
  for (const b of bands) byScore.set(b.score, b);
  const out: Array<CriterionOption & { label_hi?: string | null }> = [];
  for (let s = max; s >= 0; s--) {
    const band = byScore.get(s);
    const labelEn = band?.label_en ?? DEFAULT_LADDER[s] ?? `Score ${s}`;
    out.push({ id: `o${s}`, score: s, label: labelEn, label_hi: band?.label_hi ?? null });
  }
  return out;
}

/** Reverse: option list → bands JSON (used by the bands editor). */
export function optionsToBands(
  rows: Array<{ score: number; label_en: string; label_hi?: string | null }>,
): Json {
  return rows
    .filter((r) => Number.isFinite(r.score))
    .map((r) => ({
      score: Number(r.score),
      label_en: r.label_en.trim(),
      label_hi: (r.label_hi ?? '').trim() || null,
    })) as unknown as Json;
}

export function defaultLadder(maxScore: number): ScoringBand[] {
  const out: ScoringBand[] = [];
  for (let s = Math.floor(maxScore); s >= 0; s--) {
    out.push({ score: s, label_en: DEFAULT_LADDER[s] ?? `Score ${s}`, label_hi: null });
  }
  return out;
}