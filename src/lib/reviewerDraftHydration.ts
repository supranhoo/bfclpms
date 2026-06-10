/**
 * Reviewer Draft Hydration — SSOT (POLICY §107)
 *
 * When a reviewer reopens their own in-progress review, the picker MUST display the
 * reviewer's saved `<prefix>_achieved_value` and `<prefix>_score` verbatim. It MUST
 * NOT silently fall back to the employee's `achieved_value` or re-derive the score
 * via threshold auto-calc.
 *
 * Threshold auto-calc only fires when the reviewer explicitly edits the achieved
 * value input — that behaviour is enforced inside `AchievedValueScoreInput`.
 *
 * Background: BUG-AUD-103 (June 2026) — auditor saved 103/0 on a Lower-is-Better
 * KPI; on reopen the picker showed the employee's 99/4 instead. Root cause was an
 * inline hydration block in `UnifiedScorecard.openReviewSheet` that fell into the
 * "no draft" else branch whenever `submissionMap` raced with the sheet open, plus
 * an unconditional auto-recalc in `AchievedValueScoreInput`. This helper makes the
 * decision pure, deterministic, and testable across all reviewer stages.
 */

import { getQualitativeAchievedLabel, QualitativeOption, UomType } from './qualitativeUom';

export type ReviewerStagePrefix =
  | 'self'
  | 'manager'
  | 'skip_level'
  | 'hr_pms'
  | 'auditor'
  | 'management';

export interface ReviewerHydrationKpi {
  uom_type?: UomType | null;
  qualitative_options?: QualitativeOption[] | null;
}

export interface ReviewerHydrationSubmission {
  // Employee's own submitted value (used ONLY when no reviewer draft exists)
  achieved_value?: number | null;
  // Per-stage reviewer fields — accessed dynamically via `${prefix}_*`
  [key: string]: unknown;
}

export interface ReviewerHydrationBundle {
  achievedValue: number | string | null;
  score: number | null;
  remarks: string;
  evidenceUrls: string[];
  /** Where the values came from — useful for tests and diagnostic logging. */
  source: 'reviewer-draft' | 'employee-prefill' | 'empty';
}

function readString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function readNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function readEvidenceUrls(existingUrls: unknown, legacySingleUrl: unknown): string[] {
  if (Array.isArray(existingUrls) && existingUrls.length > 0) {
    return existingUrls.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  if (typeof legacySingleUrl === 'string' && legacySingleUrl.length > 0) {
    return [legacySingleUrl];
  }
  return [];
}

/**
 * Detects whether the reviewer has touched ANY field on this submission for the given
 * stage. A score of 0 counts as a draft — `0 != null` is the entire reason this
 * helper exists.
 */
export function hasReviewerDraft(
  existing: ReviewerHydrationSubmission | undefined | null,
  prefix: ReviewerStagePrefix,
): boolean {
  if (!existing) return false;
  const score = existing[`${prefix}_score`];
  const rating = existing[`${prefix}_rating`];
  const remarks = existing[`${prefix}_remarks`];
  const achieved = existing[`${prefix}_achieved_value`];
  const evUrl = existing[`${prefix}_evidence_url`];
  const evUrls = existing[`${prefix}_evidence_urls`];

  if (score !== null && score !== undefined) return true;
  if (rating !== null && rating !== undefined) return true;
  if (typeof remarks === 'string' && remarks.trim() !== '') return true;
  if (achieved !== null && achieved !== undefined) return true;
  if (typeof evUrl === 'string' && evUrl.length > 0) return true;
  if (Array.isArray(evUrls) && evUrls.length > 0) return true;
  return false;
}

/**
 * Pure, deterministic hydration for a reviewer-stage scorecard picker.
 *
 * Invariants:
 *  - If a reviewer draft exists, returned `achievedValue` and `score` come EXCLUSIVELY
 *    from the reviewer's own `<prefix>_*` columns. Never from `existing.achieved_value`.
 *  - For qualitative KPIs with a draft, the picker label is derived from the canonical
 *    `<prefix>_score` (mirrors POLICY §96 / qualitative-hydration memo). This guarantees
 *    the Review Journey tile and the picker tile cannot diverge.
 *  - If no draft exists, fall back to the employee's `achieved_value` (current
 *    "fresh review" UX). Score remains null — the caller can recompute via thresholds
 *    when displaying, but that recompute MUST NOT happen here.
 */
export function hydrateReviewerDraft(
  existing: ReviewerHydrationSubmission | undefined | null,
  kpi: ReviewerHydrationKpi,
  prefix: ReviewerStagePrefix,
): ReviewerHydrationBundle {
  const uomType = (kpi.uom_type || 'numeric') as UomType;
  const qualOpts = kpi.qualitative_options ?? null;
  const isQualitative = uomType === 'binary' || uomType === 'tiered';

  if (!existing) {
    return {
      achievedValue: null,
      score: null,
      remarks: '',
      evidenceUrls: [],
      source: 'empty',
    };
  }

  const draft = hasReviewerDraft(existing, prefix);
  const reviewerScore = readNumberOrNull(existing[`${prefix}_score`]);
  const reviewerAchievedRaw = existing[`${prefix}_achieved_value`];
  const reviewerAchievedNumeric = readNumberOrNull(reviewerAchievedRaw);
  const reviewerRemarks = readString(existing[`${prefix}_remarks`]);
  const reviewerEvidenceUrls = readEvidenceUrls(
    existing[`${prefix}_evidence_urls`],
    existing[`${prefix}_evidence_url`],
  );

  if (draft) {
    let achievedValue: number | string | null;
    if (isQualitative) {
      // Canonical: derive label from the reviewer's score; tie-break to achieved_value.
      const numeric = reviewerScore ?? reviewerAchievedNumeric;
      achievedValue = getQualitativeAchievedLabel(numeric, uomType, qualOpts) ?? null;
    } else {
      achievedValue = reviewerAchievedNumeric;
    }
    return {
      achievedValue,
      score: reviewerScore,
      remarks: reviewerRemarks,
      evidenceUrls: reviewerEvidenceUrls,
      source: 'reviewer-draft',
    };
  }

  // No reviewer draft — prefill from employee's value for first-time review UX.
  const employeeAchieved = readNumberOrNull(existing.achieved_value);
  const achievedValue: number | string | null = isQualitative
    ? getQualitativeAchievedLabel(employeeAchieved, uomType, qualOpts) ?? null
    : employeeAchieved;

  return {
    achievedValue,
    score: null,
    remarks: '',
    evidenceUrls: [],
    source: 'employee-prefill',
  };
}