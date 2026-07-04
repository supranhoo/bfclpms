import { describe, it, expect } from 'vitest';
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

const template: Pick<AnnualReviewTemplate, 'sections'> = {
  sections: {
    stage_weights: {
      self: 20,
      manager: 30,
      skip_manager: 10,
      dept_head: 10,
      bu_head: 20,
      hr: 10,
    },
  },
};

describe('computeRunningFinalScore', () => {
  it('returns null score and hasLockedStage=false when no stage locked', () => {
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
    // Only self counts → renormalised to 100% weight → score = 80
    expect(out.score_0_100).toBe(80);
    expect(out.contributing).toEqual(['self']);
    expect(out.pending).toContain('manager');
    expect(out.hasLockedStage).toBe(true);
  });

  it('blends Self+Manager+Skip+Dept locked into projected score', () => {
    const out = computeRunningFinalScore({
      instance: {},
      template,
      responses: [
        mkResp('self', 80, true),
        mkResp('manager', 70, true),
        mkResp('skip_manager', 60, true),
        mkResp('dept_head', 90, true),
      ],
      resolvedSystemScores: null,
    });
    // Weights of contributing buckets: 20+30+10+10 = 70
    // Blend = (80*20 + 70*30 + 60*10 + 90*10) / 70 = 4900/70 = 74.2857
    expect(out.score_0_100).toBeCloseTo(74.2857, 3);
    expect(out.pending).toEqual(expect.arrayContaining(['bu_head', 'hr']));
  });

  it('includes system-score contribution when template has a system bucket', () => {
    const tpl: Pick<AnnualReviewTemplate, 'sections'> = {
      sections: {
        stage_weights: { self: 40, manager: 40, system: 20 },
      },
    };
    const out = computeRunningFinalScore({
      instance: {},
      template: tpl,
      responses: [mkResp('self', 80, true), mkResp('manager', 60, true)],
      resolvedSystemScores: { s1: 15 },
    });
    // (80*40 + 60*40 + 15*20) / 100 = 5900/100 = 59
    expect(out.score_0_100).toBe(59);
    expect(out.contributing).toEqual(
      expect.arrayContaining(['self', 'manager', 'system']),
    );
  });

  it('falls back to legacy criteria bucket when only criteria weight configured', () => {
    const out = computeRunningFinalScore({
      instance: { criteria_weighted_score: 72 },
      template: { sections: {} },
      responses: [],
      resolvedSystemScores: null,
    });
    // Legacy default {criteria:100}
    expect(out.score_0_100).toBe(72);
  });
});