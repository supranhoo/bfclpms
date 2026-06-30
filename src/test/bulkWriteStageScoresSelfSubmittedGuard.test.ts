import { describe, it, expect } from 'vitest';

/**
 * ADR-102 — pure TS mirror of the PL/pgSQL `self_not_submitted` predicate
 * in `public.bulk_write_stage_scores`. Keep this file in lock-step with the
 * SQL guard:
 *
 *   ELSIF NOT p_is_override
 *         AND v_cur.self_score              IS NULL
 *         AND v_cur.self_achieved_value     IS NULL
 *         AND NULLIF(btrim(COALESCE(v_cur.self_remarks,'')),'') IS NULL
 *         AND v_cur.submitted_at            IS NULL
 *         AND v_cur.manager_score           IS NULL
 *         AND v_cur.functional_manager_score IS NULL
 *         AND v_cur.skip_level_score        IS NULL
 *         AND v_cur.hr_pms_score            IS NULL
 *   THEN v_reason := 'self_not_submitted';
 */

type SubmissionRow = {
  self_score: number | null;
  self_achieved_value: number | null;
  self_remarks: string | null;
  submitted_at: string | null;
  manager_score: number | null;
  functional_manager_score: number | null;
  skip_level_score: number | null;
  hr_pms_score: number | null;
};

function blank(v: string | null | undefined): boolean {
  return v == null || v.trim().length === 0;
}

export function shouldSkipSelfNotSubmitted(
  row: SubmissionRow,
  isOverride: boolean,
): boolean {
  if (isOverride) return false;
  return (
    row.self_score === null &&
    row.self_achieved_value === null &&
    blank(row.self_remarks) &&
    row.submitted_at === null &&
    row.manager_score === null &&
    row.functional_manager_score === null &&
    row.skip_level_score === null &&
    row.hr_pms_score === null
  );
}

const empty: SubmissionRow = {
  self_score: null,
  self_achieved_value: null,
  self_remarks: null,
  submitted_at: null,
  manager_score: null,
  functional_manager_score: null,
  skip_level_score: null,
  hr_pms_score: null,
};

describe('ADR-102 bulk_write_stage_scores: self_not_submitted predicate', () => {
  it('allows write when self_score is set (legacy numeric Self path)', () => {
    expect(shouldSkipSelfNotSubmitted({ ...empty, self_score: 3 }, false)).toBe(false);
  });

  it('allows write when self_achieved_value is set but self_score is null (Org-KPI / qualitative path — this is the bug)', () => {
    expect(
      shouldSkipSelfNotSubmitted({ ...empty, self_achieved_value: 2 }, false),
    ).toBe(false);
  });

  it('allows write when only a non-blank self_remarks is present', () => {
    expect(
      shouldSkipSelfNotSubmitted({ ...empty, self_remarks: '2S Achieved' }, false),
    ).toBe(false);
  });

  it('still skips when self_remarks is only whitespace and nothing else is set', () => {
    expect(
      shouldSkipSelfNotSubmitted({ ...empty, self_remarks: '   ' }, false),
    ).toBe(true);
  });

  it('allows write when submitted_at is set even though scores are NULL', () => {
    expect(
      shouldSkipSelfNotSubmitted(
        { ...empty, submitted_at: '2026-06-05T12:48:00.065Z' },
        false,
      ),
    ).toBe(false);
  });

  it('allows write when a downstream stage score exists (manager already scored)', () => {
    expect(
      shouldSkipSelfNotSubmitted({ ...empty, manager_score: 2 }, false),
    ).toBe(false);
  });

  it('allows write when functional_manager / skip_level / hr_pms score exists', () => {
    expect(
      shouldSkipSelfNotSubmitted({ ...empty, functional_manager_score: 3 }, false),
    ).toBe(false);
    expect(
      shouldSkipSelfNotSubmitted({ ...empty, skip_level_score: 3 }, false),
    ).toBe(false);
    expect(
      shouldSkipSelfNotSubmitted({ ...empty, hr_pms_score: 4 }, false),
    ).toBe(false);
  });

  it('blocks when truly nothing has been submitted', () => {
    expect(shouldSkipSelfNotSubmitted(empty, false)).toBe(true);
  });

  it('admin override always bypasses the guard (existing semantic preserved)', () => {
    expect(shouldSkipSelfNotSubmitted(empty, true)).toBe(false);
  });

  it('reproduces the V.A.V.S.S. / Jyoti row exactly', () => {
    // review_submissions.a68e9d59-80b5-4781-a821-a388e5cf904c snapshot
    const row: SubmissionRow = {
      self_score: null,
      self_achieved_value: 2,
      self_remarks: '2S Achieved',
      submitted_at: '2026-06-05T12:48:00.065Z',
      manager_score: 2,
      functional_manager_score: null,
      skip_level_score: null,
      hr_pms_score: null,
    };
    expect(shouldSkipSelfNotSubmitted(row, false)).toBe(false);
  });
});