import { describe, it, expect, vi } from 'vitest';
import { computeRunningFinalScore } from './runningFinalScore';
import type {
  AnnualReviewResponse,
  AnnualReviewTemplate,
  AnnualReviewerRole,
} from '@/types/annualReview';

function mkResp(
  role: AnnualReviewerRole,
  weighted_score: number | null,
  is_locked: boolean,
): Pick<AnnualReviewResponse, 'reviewer_role' | 'weighted_score' | 'is_locked'> {
  return { reviewer_role: role, weighted_score, is_locked };
}

// Template with 10 criteria (weight 1 each) and a system slot summing to 55.
// criteriaRawMax = 10 * 1 * 5 = 50 ; systemMax = 55 ; criteriaPoolMax = 45.
const template: Pick<AnnualReviewTemplate, 'sections'> = {
  sections: {
    criteria: Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, name: `c${i}`, weight: 1,
    })),
    system_scores: [
      { id: 's1', name: 'sys1', weight: 30 },
      { id: 's2', name: 'sys2', weight: 25 },
    ],
  } as any,
};

describe('computeRunningFinalScore', () => {
  it('returns null score and hasLockedStage=false when nothing locked and no system', () => {
    const out = computeRunningFinalScore({
      instance: {},
      template,
      responses: [mkResp('self', 80, false), mkResp('manager', 70, false)],
      resolvedSystemScores: null,
    });
    expect(out.score_0_100).toBeNull();
    expect(out.hasLockedStage).toBe(false);
    expect(out.pending.length).toBeGreaterThan(0);
  });

  it('ignores drafts (is_locked=false) even when weighted_score present', () => {
    const out = computeRunningFinalScore({
      instance: {},
      template,
      responses: [mkResp('self', 80, true), mkResp('manager', 30, false)],
      resolvedSystemScores: null,
    });
    // Only self counts (raw=80). criteriaRawMax=50, criteriaPoolMax=45.
    // Note raw 80 exceeds max (50) → pct=1.6 → contribution 72 → clamped 72.
    expect(out.score_0_100).toBe(72);
    expect(out.contributing).toEqual(['self']);
    expect(out.hasLockedStage).toBe(true);
  });

  it('uses the terminal-priority locked reviewer (ADR-124 order)', () => {
    const out = computeRunningFinalScore({
      instance: {},
      template,
      responses: [
        mkResp('self', 40, true),
        mkResp('manager', 35, true),
        mkResp('dept_head', 25, true), // terminal (highest of these three)
      ],
      resolvedSystemScores: { s1: 20, s2: 15 },
    });
    // criteriaRawMax = 50, criteriaPoolMax = 45, terminal raw = 25 → 22.5
    // systemActual = 35 → total = 57.5
    expect(out.score_0_100).toBeCloseTo(57.5, 3);
    expect(out.contributing).toEqual(expect.arrayContaining(['system', 'dept_head']));
    expect(out.pending).toEqual(expect.arrayContaining(['bu_head', 'hr']));
  });

  it('legacy — no criteria configured: treats raw as pre-scaled 0..100', () => {
    const tpl: Pick<AnnualReviewTemplate, 'sections'> = { sections: {} as any };
    const out = computeRunningFinalScore({
      instance: { criteria_weighted_score: 72 },
      template: tpl,
      responses: [mkResp('self', 72, true)],
      resolvedSystemScores: null,
    });
    expect(out.score_0_100).toBe(72);
  });

  it('never exceeds 100 even when raw weighted_score is over max', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = computeRunningFinalScore({
      instance: {},
      template,
      responses: [mkResp('dept_head', 9999, true)],
      resolvedSystemScores: { s1: 30, s2: 25 },
    });
    expect(out.score_0_100).toBe(100);
    expect((out.scaled_0_5 ?? 0)).toBeLessThanOrEqual(5);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});