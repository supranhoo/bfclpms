import type { AnnualReviewTemplate } from '@/types/annualReview';

/**
 * ADR-116 / POLICY §AR-SYSTEM-SCORES-KEY-STABILITY.
 *
 * Returns the list of System Score items on the template that require an HR
 * raw entry (source ∈ safety | hr | env | manual) but have no persisted value
 * in either `system_scores_raw` or `system_scores` on the instance.
 *
 * `carry_kra` items are excluded — they are computed live and never need HR
 * entry.
 */
export function missingRawSystemScoreItems(
  template: Pick<AnnualReviewTemplate, 'sections'> | null | undefined,
  systemScoresRaw: Record<string, unknown> | null | undefined,
  systemScores: Record<string, unknown> | null | undefined,
): { id: string; name: string; source: string }[] {
  const items = template?.sections?.system_scores ?? [];
  const raw = systemScoresRaw ?? {};
  const scaled = systemScores ?? {};
  const out: { id: string; name: string; source: string }[] = [];
  for (const s of items) {
    const source = (s as { source?: string }).source ?? 'manual';
    if (source === 'carry_kra') continue;
    const id = (s as { id: string }).id;
    const hasRaw = raw[id] !== undefined && raw[id] !== null;
    const hasScaled = scaled[id] !== undefined && scaled[id] !== null;
    if (!hasRaw && !hasScaled) {
      out.push({ id, name: (s as { name?: string }).name ?? id, source });
    }
  }
  return out;
}