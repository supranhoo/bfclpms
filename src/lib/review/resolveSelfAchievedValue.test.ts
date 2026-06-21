import { describe, it, expect } from 'vitest';
import { resolveSelfAchievedValue } from './resolveSelfAchievedValue';

const kpiMayGrievance = {
  r5: 0, r2: 1, r0: '>1' as any,
  target_value: 0,
  criteria: 'Lower is Better',
  uom: 'Number',
  uom_type: 'numeric',
  threshold_mode: 'absolute',
};

describe('resolveSelfAchievedValue', () => {
  it('prefers self_achieved_value column when present (Part 2)', () => {
    const out = resolveSelfAchievedValue(
      {
        achieved_value: 3,
        self_achieved_value: 1,
        self_score: 2,
        auditor_achieved_value: 3,
      },
      kpiMayGrievance,
    );
    expect(out).toEqual({ value: 1, source: 'pristine' });
  });

  it('returns achieved_value when no reviewer wrote a stage value (pristine)', () => {
    const out = resolveSelfAchievedValue(
      { achieved_value: 1, self_score: 2 },
      kpiMayGrievance,
    );
    expect(out).toEqual({ value: 1, source: 'pristine' });
  });

  it('returns null submission as pristine null', () => {
    expect(resolveSelfAchievedValue(null, kpiMayGrievance)).toEqual({ value: null, source: 'pristine' });
  });

  it('trusts achieved_value when current value still maps to frozen self_score', () => {
    const out = resolveSelfAchievedValue(
      { achieved_value: 1, self_score: 2, auditor_achieved_value: 1 },
      kpiMayGrievance,
    );
    expect(out).toEqual({ value: 1, source: 'pristine' });
  });

  it('reverse-derives self value when auditor overwrote achieved_value (the reported bug)', () => {
    // Reported case: data owner posted 1 → self_score=2; auditor edited to 3.
    const out = resolveSelfAchievedValue(
      { achieved_value: 3, self_score: 2, auditor_achieved_value: 3 },
      kpiMayGrievance,
    );
    expect(out).toEqual({ value: 1, source: 'recovered' });
  });

  it('returns unknown when reverse-derivation is ambiguous / no match', () => {
    const out = resolveSelfAchievedValue(
      { achieved_value: 3, self_score: 4, auditor_achieved_value: 3 },
      kpiMayGrievance,
    );
    expect(out.value).toBeNull();
    expect(out.source).toBe('unknown');
  });

  it('for binary/tiered KPIs, returns self_score as the displayed value', () => {
    const tieredKpi: any = {
      uom_type: 'tiered',
      qualitative_options: [{ label: 'Yes', score: 5 }, { label: 'No', score: 0 }],
      criteria: 'Higher is Better',
      target_value: null,
    };
    const out = resolveSelfAchievedValue(
      { achieved_value: 0, self_score: 5, auditor_achieved_value: 0 },
      tieredKpi,
    );
    expect(out).toEqual({ value: 5, source: 'recovered' });
  });
});
