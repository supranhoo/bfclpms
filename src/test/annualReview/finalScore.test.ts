import { describe, it, expect } from 'vitest';
import {
  computeFinalScore,
  isValidStageWeights,
  resolveStageWeights,
  responsesToRoleMap,
  LEGACY_STAGE_WEIGHTS,
  isValidStageWeightsV2,
  flattenStageWeightsV2,
  type StageWeightsV2,
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

    it('includes dept_head contribution when weighted', () => {
      const r = computeFinalScore({
        stageWeights: { self: 20, manager: 40, dept_head: 20, bu_head: 20 },
        responsesByRole: { self: 80, manager: 60, dept_head: 90, bu_head: 70 },
        systemScoreTotal: null,
        criteriaWeightedScore: null,
      });
      // 0.2*80 + 0.4*60 + 0.2*90 + 0.2*70 = 16 + 24 + 18 + 14 = 72
      expect(r.rawScore_0_100).toBeCloseTo(72, 4);
      expect(r.contributing).toContain('dept_head');
      expect(r.renormalised).toBe(false);
    });

    it('renormalises away dept_head when its response is missing', () => {
      const r = computeFinalScore({
        stageWeights: { manager: 50, dept_head: 50 },
        responsesByRole: { manager: 80 }, // dept_head missing
        systemScoreTotal: null,
        criteriaWeightedScore: null,
      });
      expect(r.rawScore_0_100).toBe(80);
      expect(r.renormalised).toBe(true);
      expect(r.contributing).toEqual(['manager']);
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

  describe('stage_weights_v2 (two-tier)', () => {
    it('isValidStageWeightsV2 accepts pools=100 and mix=100', () => {
      const v: StageWeightsV2 = {
        pools: { system: 60, criteria: 40 },
        criteria_mix: { self: 0, dept_head: 70, bu_head: 30 },
      };
      expect(isValidStageWeightsV2(v)).toBe(true);
    });

    it('isValidStageWeightsV2 rejects bad totals or negatives', () => {
      expect(isValidStageWeightsV2(null)).toBe(false);
      expect(isValidStageWeightsV2({
        pools: { system: 50, criteria: 40 },
        criteria_mix: { manager: 100 },
      })).toBe(false);
      expect(isValidStageWeightsV2({
        pools: { system: 100 },
        criteria_mix: { manager: 50, bu_head: 40 }, // 90
      })).toBe(false);
      expect(isValidStageWeightsV2({
        pools: { system: -10, criteria: 110 },
        criteria_mix: { manager: 100 },
      })).toBe(false);
    });

    it('flattenStageWeightsV2 derives correct flat blend (60/40, dept 70 / bu 30)', () => {
      const flat = flattenStageWeightsV2({
        pools: { system: 60, criteria: 40 },
        criteria_mix: { self: 0, dept_head: 70, bu_head: 30 },
      });
      // 40 * 0.7 = 28, 40 * 0.3 = 12, system 60
      expect(flat).toEqual({ system: 60, dept_head: 28, bu_head: 12 });
    });

    it('resolveStageWeights prefers v2 when valid', () => {
      const tpl = {
        sections: {
          stage_weights: { criteria: 100 }, // legacy flat present
          stage_weights_v2: {
            pools: { system: 60, criteria: 40 },
            criteria_mix: { self: 0, dept_head: 70, bu_head: 30 },
          },
        },
      } as any;
      expect(resolveStageWeights(null, tpl)).toEqual({
        system: 60, dept_head: 28, bu_head: 12,
      });
    });

    it('resolveStageWeights falls through to flat when v2 invalid', () => {
      const tpl = {
        sections: {
          stage_weights: { self: 20, manager: 50, bu_head: 30 },
          stage_weights_v2: {
            pools: { system: 60, criteria: 30 }, // doesn't sum to 100
            criteria_mix: { manager: 100 },
          },
        },
      } as any;
      expect(resolveStageWeights(null, tpl)).toEqual({ self: 20, manager: 50, bu_head: 30 });
    });

    it('end-to-end: v2-derived blend matches hand-entered flat blend in computeFinalScore', () => {
      const v2: StageWeightsV2 = {
        pools: { system: 60, criteria: 40 },
        criteria_mix: { self: 0, dept_head: 70, bu_head: 30 },
      };
      const derived = flattenStageWeightsV2(v2);
      const inputs = {
        responsesByRole: { self: 50, dept_head: 80, bu_head: 60 },
        systemScoreTotal: 75,
        criteriaWeightedScore: null,
      } as const;
      const fromV2 = computeFinalScore({ stageWeights: derived, ...inputs });
      const fromFlat = computeFinalScore({
        stageWeights: { system: 60, dept_head: 28, bu_head: 12 },
        ...inputs,
      });
      expect(fromV2.rawScore_0_100).toBe(fromFlat.rawScore_0_100);
      // self has 0 weight → must not appear or affect the result
      expect(fromV2.contributing).not.toContain('self');
      // 0.6*75 + 0.28*80 + 0.12*60 = 45 + 22.4 + 7.2 = 74.6
      expect(fromV2.rawScore_0_100).toBeCloseTo(74.6, 4);
    });

    it('v2 with self=0 does not give self any weight when self response missing', () => {
      const v2: StageWeightsV2 = {
        pools: { system: 50, criteria: 50 },
        criteria_mix: { self: 0, manager: 100 },
      };
      const flat = flattenStageWeightsV2(v2);
      const r = computeFinalScore({
        stageWeights: flat,
        responsesByRole: { manager: 80 }, // no self
        systemScoreTotal: 70,
        criteriaWeightedScore: null,
      });
      // 0.5*70 + 0.5*80 = 75 — no renormalisation, self carries no weight
      expect(r.rawScore_0_100).toBe(75);
      expect(r.renormalised).toBe(false);
      expect(r.contributing).toEqual(['system', 'manager']);
    });
  });
});