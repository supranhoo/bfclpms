import { describe, it, expect } from 'vitest';
import {
  resolveStageWeights,
  isValidStageWeights,
  computeFinalScore,
  LEGACY_STAGE_WEIGHTS,
} from '@/lib/annualReview/finalScore';
import type { AnnualReviewInstance, AnnualReviewTemplate } from '@/types/annualReview';

/**
 * Phase 2 — verifies the precedence chain:
 *   instance.stage_weights_override > template.sections.stage_weights > LEGACY
 * and that invalid maps fall through cleanly.
 */
describe('Stage weights override precedence (Phase 2)', () => {
  const tpl = {
    sections: { stage_weights: { self: 20, manager: 50, bu_head: 30 } },
  } as unknown as AnnualReviewTemplate;

  it('instance override wins over template', () => {
    const inst = { stage_weights_override: { manager: 100 } } as unknown as AnnualReviewInstance;
    expect(resolveStageWeights(inst, tpl)).toEqual({ manager: 100 });
  });

  it('template wins when override absent', () => {
    const inst = { stage_weights_override: null } as unknown as AnnualReviewInstance;
    expect(resolveStageWeights(inst, tpl)).toEqual({ self: 20, manager: 50, bu_head: 30 });
  });

  it('legacy default when both absent', () => {
    expect(resolveStageWeights({} as AnnualReviewInstance, { sections: {} } as AnnualReviewTemplate))
      .toEqual(LEGACY_STAGE_WEIGHTS);
  });

  it('invalid override (sum != 100) falls through to template', () => {
    const inst = { stage_weights_override: { self: 10 } } as unknown as AnnualReviewInstance;
    expect(resolveStageWeights(inst, tpl)).toEqual({ self: 20, manager: 50, bu_head: 30 });
  });

  it('invalid template falls through to legacy', () => {
    const bad = { sections: { stage_weights: { manager: 30 } } } as unknown as AnnualReviewTemplate;
    expect(resolveStageWeights({} as AnnualReviewInstance, bad)).toEqual(LEGACY_STAGE_WEIGHTS);
  });

  it('rejects negative weights', () => {
    expect(isValidStageWeights({ self: -5, manager: 105 })).toBe(false);
  });

  it('blended score honours override + renormalises missing stage', () => {
    const out = computeFinalScore({
      stageWeights: { self: 20, manager: 50, bu_head: 30 },
      responsesByRole: { self: 80, manager: 70 }, // bu_head missing → renormalised
      systemScoreTotal: null,
      criteriaWeightedScore: null,
    });
    // (80*20 + 70*50) / (20+50) = (1600+3500)/70 = 72.857...
    expect(out.rawScore_0_100).toBeCloseTo(72.8571, 3);
    expect(out.scaled_0_5).toBeCloseTo(3.6429, 3);
    expect(out.renormalised).toBe(true);
    expect(out.contributing).toEqual(['self', 'manager']);
  });

  it('returns nulls when no bucket contributes', () => {
    const out = computeFinalScore({
      stageWeights: { self: 100 },
      responsesByRole: {},
      systemScoreTotal: null,
      criteriaWeightedScore: null,
    });
    expect(out.rawScore_0_100).toBeNull();
    expect(out.scaled_0_5).toBeNull();
  });
});