import { describe, it, expect } from 'vitest';
import {
  missingStageCriteria,
  stageScoreGuardMessage,
  isNarrativeOnlyStage,
  isUnscoredStageResponse,
} from '@/lib/annualReview/stageScoreGuard';
import type { AnnualReviewTemplate } from '@/types/annualReview';

/**
 * POLICY §AR-STAGE-SCORE-REQUIRED (ADR-172).
 * RCA: reviewer stages (dept_head / bu_head) could lock an empty response
 * because the client guard was gated on `role === 'self'`, producing bogus
 * `0.0` ratings in the admin grid.
 */
const tpl = (over: Partial<AnnualReviewTemplate['sections']> = {}): AnnualReviewTemplate =>
  ({
    id: 't1',
    name: 'T',
    sections: {
      criteria: [
        { id: 'c1', name: 'Quality', weight: 50 },
        { id: 'c2', name: 'Safety', weight: 50, reviewer_stages: ['dept_head'] },
      ],
      system_scores: [],
      ...over,
    },
  } as unknown as AnnualReviewTemplate);

describe('isNarrativeOnlyStage', () => {
  it('false when the stage has scoreable criteria', () => {
    expect(isNarrativeOnlyStage(tpl(), 'dept_head')).toBe(false);
  });
  it('true when system_scores already allocate 100%', () => {
    expect(isNarrativeOnlyStage(tpl({ system_scores: [{ id: 's', name: 'Sys', weight: 100 }] as never }), 'bu_head')).toBe(true);
  });
  it('true when no criteria map to the stage', () => {
    const t = tpl({ criteria: [{ id: 'c2', name: 'Safety', weight: 50, reviewer_stages: ['dept_head'] }] as never });
    expect(isNarrativeOnlyStage(t, 'bu_head')).toBe(true);
  });
});

describe('missingStageCriteria', () => {
  it('lists every unscored criterion for a reviewer stage', () => {
    expect(missingStageCriteria(tpl(), 'dept_head', {}).map((c) => c.id)).toEqual(['c1', 'c2']);
  });
  it('respects reviewer_stages filtering (bu_head only sees c1)', () => {
    expect(missingStageCriteria(tpl(), 'bu_head', {}).map((c) => c.id)).toEqual(['c1']);
  });
  it('empty when all visible criteria are scored', () => {
    expect(missingStageCriteria(tpl(), 'dept_head', { c1: 4, c2: 3 })).toEqual([]);
  });
  it('treats 0 as a valid score, not a miss', () => {
    expect(missingStageCriteria(tpl(), 'bu_head', { c1: 0 })).toEqual([]);
  });
  it('treats null / NaN as unscored', () => {
    expect(missingStageCriteria(tpl(), 'bu_head', { c1: null }).map((c) => c.id)).toEqual(['c1']);
    expect(missingStageCriteria(tpl(), 'bu_head', { c1: Number.NaN }).map((c) => c.id)).toEqual(['c1']);
  });
  it('narrative-only stage never blocks', () => {
    const t = tpl({ system_scores: [{ id: 's', name: 'Sys', weight: 100 }] as never });
    expect(missingStageCriteria(t, 'dept_head', {})).toEqual([]);
  });
});

describe('stageScoreGuardMessage', () => {
  it('returns a message naming the missing criteria', () => {
    expect(stageScoreGuardMessage(tpl(), 'dept_head', {})).toContain('Quality');
  });
  it('returns null when the stage may advance', () => {
    expect(stageScoreGuardMessage(tpl(), 'dept_head', { c1: 5, c2: 5 })).toBeNull();
  });
  it('applies identically to self and reviewer stages (no role gating)', () => {
    expect(stageScoreGuardMessage(tpl(), 'self', {})).not.toBeNull();
    expect(stageScoreGuardMessage(tpl(), 'bu_head', {})).not.toBeNull();
  });
});

describe('isUnscoredStageResponse (display gap detection)', () => {
  it('locked + scoreable template + zero scores = data gap', () => {
    expect(isUnscoredStageResponse({ isLocked: true, criteriaScoreCount: 0, templateHasScoreableCriteria: true })).toBe(true);
  });
  it('genuine zero rating is not a gap', () => {
    expect(isUnscoredStageResponse({ isLocked: true, criteriaScoreCount: 3, templateHasScoreableCriteria: true })).toBe(false);
  });
  it('narrative-only template is not a gap', () => {
    expect(isUnscoredStageResponse({ isLocked: true, criteriaScoreCount: 0, templateHasScoreableCriteria: false })).toBe(false);
  });
  it('draft (unlocked) response is not a gap', () => {
    expect(isUnscoredStageResponse({ isLocked: false, criteriaScoreCount: 0, templateHasScoreableCriteria: true })).toBe(false);
  });
});
