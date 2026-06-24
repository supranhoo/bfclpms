import { describe, it, expect } from 'vitest';
import {
  computeFinalScore,
  isValidStageWeights,
  resolveStageWeights,
  responsesToRoleMap,
  LEGACY_STAGE_WEIGHTS,
} from '@/lib/annualReview/finalScore';

describe('annualReview/finalScore', () => {
  describe('isValidStageWeights', () => {
    it('accepts a map summing to 100', () => {
      expect(isValidStageWeights({ self: 20, manager: 50, bu_head: 30 })).toBe(true);
    });
    it('accepts dept_head as an allowed bucket', () => {
      expect(isValidStageWeights({ dept_head: 100 })).toBe(true);
      expect(
        isValidStageWeights({ self: 20, manager: 40, dept_head: 20, bu_head: 20 }),
      ).toBe(true);
    });
    it('rejects nulls, NaN, negatives, and totals != 100', () => {
      expect(isValidStageWeights(null)).toBe(false);
      expect(isValidStageWeights({ self: 50, manager: 49 })).toBe(false);
      expect(isValidStageWeights({ self: -10, manager: 110 })).toBe(false);
    });
  });

  describe('resolveStageWeights', () => {
    it('falls back to legacy { criteria: 100 } with no inputs', () => {
      expect(resolveStageWeights(null, null)).toEqual(LEGACY_STAGE_WEIGHTS);
    });
    it('uses template stage_weights when valid', () => {
      const tpl = { sections: { stage_weights: { self: 20, manager: 50, bu_head: 30 } } } as any;
      expect(resolveStageWeights(null, tpl)).toEqual({ self: 20, manager: 50, bu_head: 30 });
    });
    it('per-instance override beats template', () => {
      const tpl = { sections: { stage_weights: { self: 20, manager: 50, bu_head: 30 } } } as any;
      const inst = { stage_weights_override: { manager: 60, hr: 40 } } as any;
      expect(resolveStageWeights(inst, tpl)).toEqual({ manager: 60, hr: 40 });
    });
    it('invalid override falls through to template', () => {
      const tpl = { sections: { stage_weights: { self: 100 } } } as any;
      const inst = { stage_weights_override: { manager: 30 } } as any; // doesn't sum to 100
      expect(resolveStageWeights(inst, tpl)).toEqual({ self: 100 });
    });
  });

  describe('computeFinalScore', () => {
    it('blends 20/50/30 to a hand-computed value', () => {
      const r = computeFinalScore({
        stageWeights: { self: 20, manager: 50, bu_head: 30 },
        responsesByRole: { self: 80, manager: 60, bu_head: 90 },
        systemScoreTotal: null,
        criteriaWeightedScore: null,
      });
      // 0.2*80 + 0.5*60 + 0.3*90 = 16 + 30 + 27 = 73
      expect(r.rawScore_0_100).toBeCloseTo(73, 4);
      expect(r.scaled_0_5).toBeCloseTo(3.65, 4);
      expect(r.renormalised).toBe(false);
      expect(r.contributing).toEqual(['self', 'manager', 'bu_head']);
    });

    it('renormalises when a configured bucket has no input', () => {
      const r = computeFinalScore({
        stageWeights: { self: 20, manager: 50, bu_head: 30 },
        responsesByRole: { self: 80, manager: 60 }, // bu_head missing
        systemScoreTotal: null,
        criteriaWeightedScore: null,
      });
      // weights present: 20+50=70 → (80*20 + 60*50)/70 = (1600+3000)/70 = 65.7142857
      expect(r.rawScore_0_100).toBeCloseTo(65.7143, 3);
      expect(r.renormalised).toBe(true);
    });

    it('legacy fallback uses criteria bucket only', () => {
      const r = computeFinalScore({
        stageWeights: LEGACY_STAGE_WEIGHTS,
        responsesByRole: { manager: 90 },
        systemScoreTotal: 50,
        criteriaWeightedScore: 72.5,
      });
      expect(r.rawScore_0_100).toBe(72.5);
      expect(r.contributing).toEqual(['criteria']);
      expect(r.renormalised).toBe(false);
    });

    it('returns null score when no buckets contribute', () => {
      const r = computeFinalScore({
        stageWeights: { self: 100 },
        responsesByRole: {}, // self missing
        systemScoreTotal: null,
        criteriaWeightedScore: null,
      });
      expect(r.rawScore_0_100).toBeNull();
      expect(r.scaled_0_5).toBeNull();
      expect(r.renormalised).toBe(true);
    });

    it('zero-weight buckets are ignored without renormalisation flag', () => {
      const r = computeFinalScore({
        stageWeights: { self: 0, manager: 100 },
        responsesByRole: { manager: 80 },
        systemScoreTotal: null,
        criteriaWeightedScore: null,
      });
      expect(r.rawScore_0_100).toBe(80);
      expect(r.renormalised).toBe(false);
    });
  });

  describe('responsesToRoleMap', () => {
    it('skips unsubmitted responses', () => {
      const m = responsesToRoleMap([
        { reviewer_role: 'self', weighted_score: 80, submitted_at: '2026-01-01' } as any,
        { reviewer_role: 'manager', weighted_score: 70, submitted_at: null } as any,
      ]);
      expect(m).toEqual({ self: 80 });
    });
  });
});