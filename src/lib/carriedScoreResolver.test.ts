import { describe, it, expect } from 'vitest';
import { resolveCarriedScore, type KpiRule, type SubmissionScores } from './carriedScoreResolver';

const baseSub: SubmissionScores = {
  self_score: null, manager_score: null, skip_level_score: null,
  hr_pms_score: null, achieved_value: null, is_na: false,
};

const numericHigher: KpiRule = {
  id: 'k1', weightage: 10, criteria: 'Higher is Better', uom: 'Number',
  uom_type: 'numeric', target_value: 100, threshold_mode: 'absolute',
  r5: 100, r4: 90, r3: 80, r2: 60, r1: 40, r0: 0,
};

const numericLower: KpiRule = {
  ...numericHigher, id: 'k2', criteria: 'Lower is Better',
  r5: 0, r4: 1, r3: 2, r2: 4, r1: 6, r0: 10,
};

describe('resolveCarriedScore', () => {
  it('manager stage carries self_score', () => {
    expect(resolveCarriedScore({
      stage: 'manager', kpi: numericHigher,
      submission: { ...baseSub, self_score: 4 },
    })).toEqual({ score: 4, source: 'self' });
  });

  it('skip_level prefers manager over self', () => {
    expect(resolveCarriedScore({
      stage: 'skip_level', kpi: numericHigher,
      submission: { ...baseSub, self_score: 4, manager_score: 3 },
    })).toEqual({ score: 3, source: 'manager' });
  });

  it('hr_pms cascades skip → manager → self', () => {
    expect(resolveCarriedScore({
      stage: 'hr_pms', kpi: numericHigher,
      submission: { ...baseSub, self_score: 4 },
    }).source).toBe('self');
    expect(resolveCarriedScore({
      stage: 'hr_pms', kpi: numericHigher,
      submission: { ...baseSub, self_score: 4, manager_score: 3, skip_level_score: 2 },
    }).source).toBe('skip_level');
  });

  it('auditor cascades hr_pms first', () => {
    expect(resolveCarriedScore({
      stage: 'auditor', kpi: numericHigher,
      submission: { ...baseSub, self_score: 4, manager_score: 3, hr_pms_score: 5 },
    })).toEqual({ score: 5, source: 'hr_pms' });
  });

  it('falls back to computed rating from achievement (higher-is-better)', () => {
    const out = resolveCarriedScore({
      stage: 'manager', kpi: numericHigher,
      submission: { ...baseSub, achieved_value: 85 },
    });
    expect(out.source).toBe('computed');
    expect(out.score).toBe(3); // 85 ≥ R3=80
  });

  it('falls back to computed rating (lower-is-better)', () => {
    const out = resolveCarriedScore({
      stage: 'hr_pms', kpi: numericLower,
      submission: { ...baseSub, achieved_value: 1 },
    });
    expect(out.source).toBe('computed');
    expect(out.score).toBe(4); // 1 ≤ R4=1
  });

  it('R0 cap returns 0 (still computed, not none)', () => {
    const out = resolveCarriedScore({
      stage: 'manager', kpi: numericHigher,
      submission: { ...baseSub, achieved_value: -50 },
    });
    expect(out.source).toBe('computed');
    expect(out.score).toBe(0);
  });

  it('returns none when N/A', () => {
    expect(resolveCarriedScore({
      stage: 'manager', kpi: numericHigher,
      submission: { ...baseSub, self_score: 4, is_na: true },
    })).toEqual({ score: null, source: 'none' });
  });

  it('returns none when no prior score AND no achievement', () => {
    expect(resolveCarriedScore({
      stage: 'hr_pms', kpi: numericHigher,
      submission: baseSub,
    })).toEqual({ score: null, source: 'none' });
  });

  it('returns none when no prior score AND no thresholds defined', () => {
    const noThresholds: KpiRule = {
      ...numericHigher, r0: null, r1: null, r2: null, r3: null, r4: null, r5: null,
    };
    expect(resolveCarriedScore({
      stage: 'manager', kpi: noThresholds,
      submission: { ...baseSub, achieved_value: 50 },
    })).toEqual({ score: null, source: 'none' });
  });

  it('two cells, same KPI name, different per-employee rules → different scores', () => {
    // Employee A: R3 = 80 (lenient)
    const ruleA: KpiRule = { ...numericHigher, id: 'a' };
    // Employee B: R3 = 95 (strict)
    const ruleB: KpiRule = { ...numericHigher, id: 'b', r3: 95, r4: 98, r5: 100 };
    const sub = { ...baseSub, achieved_value: 90 };
    const a = resolveCarriedScore({ stage: 'manager', kpi: ruleA, submission: sub });
    const b = resolveCarriedScore({ stage: 'manager', kpi: ruleB, submission: sub });
    expect(a.score).toBe(4); // 90 ≥ R4=90 (lenient rule)
    expect(b.score).toBe(2); // 90 only ≥ R2=60 (strict rule keeps R4=98)
  });
});
