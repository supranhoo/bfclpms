/**
 * ADR-234 / POLICY §AR-SYSTEM-SCORE-TEMPLATE-SCOPE
 *
 * Only system-score slots declared by the *effective* template
 * (`template_override_id ?? template_id`) may contribute points to an annual
 * review's final score. Keys left behind by a template swap ("orphans") are
 * excluded from every calculation and surfaced for repair.
 *
 * Client mirror of `public.annual_review_compute_final_summary` — keep both in
 * sync.
 */

export interface SlotLike { id: string }

/** Ids of the slots declared by the effective template. */
export function declaredSlotIds(slots: ReadonlyArray<SlotLike> | null | undefined): Set<string> {
  return new Set((slots ?? []).map((s) => s.id).filter(Boolean));
}

/** Stored keys that no longer exist on the effective template. */
export function orphanSystemScoreKeys(
  slots: ReadonlyArray<SlotLike> | null | undefined,
  systemScores: Record<string, unknown> | null | undefined,
): string[] {
  const declared = declaredSlotIds(slots);
  return Object.keys(systemScores ?? {}).filter((k) => !declared.has(k));
}

/** Points carried by orphan keys (the amount by which a score is inflated). */
export function orphanSystemScorePoints(
  slots: ReadonlyArray<SlotLike> | null | undefined,
  systemScores: Record<string, unknown> | null | undefined,
): number {
  return orphanSystemScoreKeys(slots, systemScores).reduce((acc, k) => {
    const v = Number((systemScores ?? {})[k]);
    return Number.isFinite(v) ? acc + v : acc;
  }, 0);
}

/** Template-scoped sum of system-score points — the only sanctioned total. */
export function templateScopedSystemPoints(
  slots: ReadonlyArray<SlotLike> | null | undefined,
  systemScores: Record<string, unknown> | null | undefined,
): number {
  const declared = declaredSlotIds(slots);
  let sum = 0;
  for (const [k, raw] of Object.entries(systemScores ?? {})) {
    if (!declared.has(k)) continue;
    const v = Number(raw);
    if (Number.isFinite(v)) sum += v;
  }
  return Number(sum.toFixed(4));
}

/** Drops orphan keys from a stored map (used before recomputation/display). */
export function pruneOrphanSystemScores<T>(
  slots: ReadonlyArray<SlotLike> | null | undefined,
  systemScores: Record<string, T> | null | undefined,
): Record<string, T> {
  const declared = declaredSlotIds(slots);
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(systemScores ?? {})) {
    if (declared.has(k)) out[k] = v;
  }
  return out;
}