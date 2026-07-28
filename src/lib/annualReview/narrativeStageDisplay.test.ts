/**
 * ADR-197 / POLICY §AR-STAGE-SUBMIT-SCORE-COMPLETENESS.
 * A submitted stage with no criteria scores must be distinguishable:
 * narrative-only (template scores nothing there) vs a genuine defect.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveStageDisplayRating,
  stageScoreableCriteriaCount,
} from '@/lib/annualReview/kraStageDisplay';

const crit = (stages: string[], weight = 10) =>
  ({ id: Math.random().toString(36), name: 'c', weight, reviewer_stages: stages }) as any;

describe('stageScoreableCriteriaCount', () => {
  it('counts only weighted criteria assigned to the role', () => {
    const criteria = [crit(['dept_head']), crit(['dept_head'], 0), crit(['bu_head'])];
    expect(stageScoreableCriteriaCount(criteria, 'dept_head')).toBe(1);
    expect(stageScoreableCriteriaCount(criteria, 'hr')).toBe(0);
    expect(stageScoreableCriteriaCount(null, 'dept_head')).toBe(0);
  });
});

describe('resolveStageDisplayRating — narrative classification', () => {
  const base = { isKraTemplate: false, kraRating: null } as const;

  it('flags a submitted zero-criteria stage as narrative', () => {
    const r = resolveStageDisplayRating({
      ...base,
      cell: { weighted_score: null, scored: false, submitted: true },
      criteria: [crit(['bu_head'])],
      role: 'dept_head',
    });
    expect(r).toEqual({ value: null, source: 'narrative' });
  });

  it('keeps a defective unscored stage blank (no source)', () => {
    const r = resolveStageDisplayRating({
      ...base,
      cell: { weighted_score: null, scored: false, submitted: true },
      criteria: [crit(['dept_head'])],
      role: 'dept_head',
    });
    expect(r).toEqual({ value: null, source: null });
  });

  it('never labels an unsubmitted stage as narrative', () => {
    const r = resolveStageDisplayRating({
      ...base,
      cell: { weighted_score: null, scored: false, submitted: false },
      criteria: [],
      role: 'dept_head',
    });
    expect(r).toEqual({ value: null, source: null });
  });

  it('still prefers a real criteria rating', () => {
    const r = resolveStageDisplayRating({
      ...base,
      cell: { weighted_score: 40, scored: true, submitted: true },
      criteria: [crit(['dept_head'], 10)],
      role: 'dept_head',
    });
    expect(r.source).toBe('criteria');
    expect(r.value).toBeCloseTo(4);
  });

  it('still prefers KRA derivation over narrative on KRA templates', () => {
    const r = resolveStageDisplayRating({
      cell: { weighted_score: null, scored: false, submitted: true },
      criteria: [],
      role: 'dept_head',
      isKraTemplate: true,
      kraRating: 4.2,
    });
    expect(r).toEqual({ value: 4.2, source: 'kra' });
  });
});