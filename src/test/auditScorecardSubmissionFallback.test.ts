import { describe, it, expect } from 'vitest';

/**
 * RCA Jun-2026 — Auditor's Review Journey saw "N/A" for Self/Manager while
 * the row existed in `review_submissions`. Root cause: the current-period
 * `submissionMap` was a stale React Query snapshot. Fix: fall back to the
 * cross-period `allSubmissions` cache before defaulting to `null`.
 *
 * This test pins the resolution order so future refactors of AuditScorecard
 * cannot silently drop the fallback.
 */
type Submission = { kpi_id: string; self_score: number | null; manager_score: number | null };

function resolveSheetSubmission(
  selectedKpiId: string,
  submissionMap: Map<string, Submission>,
  allSubmissions: Submission[] | undefined,
): Submission | null {
  return (
    submissionMap.get(selectedKpiId)
    ?? allSubmissions?.find(s => s.kpi_id === selectedKpiId)
    ?? null
  );
}

describe('AuditScorecard submission resolution (current-period → all-period → null)', () => {
  const row: Submission = { kpi_id: 'k1', self_score: 5, manager_score: 5 };

  it('returns the current-period row when present', () => {
    const map = new Map([['k1', row]]);
    expect(resolveSheetSubmission('k1', map, [])).toEqual(row);
  });

  it('falls back to allSubmissions when the current-period map is empty/stale', () => {
    const map = new Map<string, Submission>();
    expect(resolveSheetSubmission('k1', map, [row])).toEqual(row);
  });

  it('prefers the current-period row over allSubmissions when both exist', () => {
    const fresh = { ...row, self_score: 4 };
    const stale = { ...row, self_score: 2 };
    const map = new Map([['k1', fresh]]);
    expect(resolveSheetSubmission('k1', map, [stale])).toEqual(fresh);
  });

  it('returns null only when neither source has a matching row (true N/A)', () => {
    expect(resolveSheetSubmission('k1', new Map(), [])).toBeNull();
    expect(resolveSheetSubmission('k1', new Map(), undefined)).toBeNull();
  });
});