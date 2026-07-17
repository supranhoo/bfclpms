import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { UomType } from '@/lib/qualitativeUom';

/**
 * Resolve the value to display under the "Self" stage in the KPI Journey card.
 *
 * Background (RCA Jun-2026, KPI 8b6e2e67…):
 * `review_submissions.achieved_value` is a SHARED column that downstream
 * stages (auditor bulk sign-off, manager edits, …) historically OVERWRITE
 * when they record their own value. Meanwhile `self_score` is frozen at
 * self-submit time. The Self journey card therefore mixed a mutable column
 * (Value) with a frozen column (Rating) and could show e.g. "Value 3 / Rating 2".
 *
 * Until storage is hardened (Part 2 — add `self_achieved_value` column),
 * this resolver reconstructs the Self value:
 *
 * 1. No submission → null.
 * 2. No reviewer-stage achieved_value has been written → trust `achieved_value`.
 * 3. self_score is null → nothing to anchor on, fall back to `achieved_value`.
 * 4. Recompute the rating from the current `achieved_value`. If it matches
 *    the frozen `self_score`, `achieved_value` is still the self value → trust it.
 * 5. Mismatch → `achieved_value` was edited by a reviewer. Reverse-derive by
 *    testing the KPI's r0…r5 threshold values (and self_score itself for
 *    binary/tiered) for one whose recomputed rating equals `self_score`.
 *    Return it when uniquely found, otherwise return null so the UI can
 *    show "—" with a tooltip rather than a misleading number.
 */

type AchievedSubmission = {
  achieved_value?: number | null;
  /** §SELF-SNAPSHOT-DISPLAY Part 2: dedicated frozen self snapshot. */
  self_achieved_value?: number | null;
  self_score?: number | null;
  manager_achieved_value?: number | null;
  auditor_achieved_value?: number | null;
  management_achieved_value?: number | null;
  skip_level_achieved_value?: number | null;
  hr_pms_achieved_value?: number | null;
  functional_manager_achieved_value?: number | null;
};

type ThresholdSource = {
  r5?: number | string | null;
  r4?: number | string | null;
  r3?: number | string | null;
  r2?: number | string | null;
  r1?: number | string | null;
  r0?: number | string | null;
  target_value?: number | null;
  criteria?: string | null;
  uom?: string | null;
  uom_type?: string | null;
  qualitative_options?: any;
  threshold_mode?: string | null;
};

export interface ResolvedSelfValue {
  /** Value to display under Self. Null when we cannot reliably reconstruct. */
  value: number | null;
  /**
   * 'pristine'  — `achieved_value` was never overwritten by a reviewer.
   * 'recovered' — reverse-derived from the KPI scale + frozen `self_score`.
   * 'unknown'   — reviewer overwrote `achieved_value` and we could not
   *               reconstruct the original self value; UI should show "—".
   */
  source: 'pristine' | 'recovered' | 'unknown';
}

function reviewerStageWroteAchieved(s: AchievedSubmission): boolean {
  return (
    s.manager_achieved_value != null ||
    s.auditor_achieved_value != null ||
    s.management_achieved_value != null ||
    s.skip_level_achieved_value != null ||
    s.hr_pms_achieved_value != null ||
    s.functional_manager_achieved_value != null
  );
}

function ratingFor(value: number, kpi: ThresholdSource): number | null {
  const thresholds: RatingThresholds = {
    r5: (kpi.r5 ?? null) as any,
    r4: (kpi.r4 ?? null) as any,
    r3: (kpi.r3 ?? null) as any,
    r2: (kpi.r2 ?? null) as any,
    r1: (kpi.r1 ?? null) as any,
    r0: (kpi.r0 ?? null) as any,
  };
  try {
    const r = calculateRating(
      value,
      kpi.target_value ?? null,
      thresholds,
      kpi.criteria || 'Higher is Better',
      0,
      (kpi.uom_type as UomType) || 'numeric',
      kpi.qualitative_options ?? null,
      kpi.uom ?? undefined,
      ((kpi.threshold_mode as 'absolute' | 'ratio') || 'absolute'),
    );
    return typeof r?.rating === 'number' ? r.rating : null;
  } catch {
    return null;
  }
}

function thresholdCandidates(kpi: ThresholdSource): number[] {
  const raw = [kpi.r0, kpi.r1, kpi.r2, kpi.r3, kpi.r4, kpi.r5];
  const out = new Set<number>();
  for (const v of raw) {
    if (v == null) continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (!Number.isNaN(n) && Number.isFinite(n)) out.add(n);
  }
  return Array.from(out);
}

export function resolveSelfAchievedValue(
  submission: AchievedSubmission | null | undefined,
  kpi: ThresholdSource,
): ResolvedSelfValue {
  if (!submission) return { value: null, source: 'pristine' };

  // Part 2: dedicated column is the source of truth when present. Written
  // by `useSubmitSelfReview` and `propagate_org_kpi_value`, backfilled
  // from kpi_audit_logs for historical rows. Reviewer-stage RPCs do NOT
  // touch it, so it survives auditor/manager overrides.
  if (submission.self_achieved_value != null) {
    // CAPA-2026-07 stale-guard: if the snapshot no longer matches the
    // frozen `self_score` under the current KPI thresholds, a self-owning
    // writer (Admin Data Entry, admin override) refreshed
    // `achieved_value` / `self_score` without mirroring the snapshot.
    // Prefer whichever column recomputes to `self_score`; otherwise fall
    // through to the recovery logic instead of rendering a stale number.
    const selfScore = submission.self_score ?? null;
    if (selfScore == null) {
      return { value: submission.self_achieved_value, source: 'pristine' };
    }
    const snapshotRating = ratingFor(submission.self_achieved_value, kpi);
    if (snapshotRating === selfScore) {
      return { value: submission.self_achieved_value, source: 'pristine' };
    }
    const av = submission.achieved_value ?? null;
    if (av != null) {
      const avRating = ratingFor(av, kpi);
      if (avRating === selfScore) {
        return { value: av, source: 'recovered' };
      }
    }
    // Snapshot is stale and shared column doesn't match either — fall
    // through to reverse-derivation below.
  }

  const av = submission.achieved_value ?? null;
  const selfScore = submission.self_score ?? null;

  if (!reviewerStageWroteAchieved(submission)) {
    return { value: av, source: 'pristine' };
  }
  if (selfScore == null || av == null) {
    return { value: av, source: 'pristine' };
  }

  // Binary / tiered KPIs: achieved value IS the rating score.
  const uomType = (kpi.uom_type as UomType) || 'numeric';
  const isQualitative =
    uomType === 'binary' ||
    (uomType === 'tiered' && Array.isArray(kpi.qualitative_options) && (kpi.qualitative_options as any[]).length > 0);
  if (isQualitative) {
    return { value: selfScore, source: 'recovered' };
  }

  // Check whether current achieved_value is still consistent with frozen self_score.
  const currentRating = ratingFor(av, kpi);
  if (currentRating != null && currentRating === selfScore) {
    return { value: av, source: 'pristine' };
  }

  // Reverse-derive from threshold values.
  const candidates = thresholdCandidates(kpi);
  const matches = candidates.filter(c => ratingFor(c, kpi) === selfScore);
  if (matches.length === 1) {
    return { value: matches[0], source: 'recovered' };
  }
  // Couldn't recover unambiguously.
  return { value: null, source: 'unknown' };
}
