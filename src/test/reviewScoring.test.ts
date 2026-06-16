import { describe, it, expect } from 'vitest';
import { kpiHasScoringLogic } from '@/lib/reviewScoring';

describe('kpiHasScoringLogic', () => {
  it('returns false for null/undefined', () => {
    expect(kpiHasScoringLogic(null)).toBe(false);
    expect(kpiHasScoringLogic(undefined)).toBe(false);
  });

  it('numeric KPI with R5..R0 thresholds → true', () => {
    expect(
      kpiHasScoringLogic({
        uom_type: 'numeric',
        r5: '100', r4: '90', r3: '80', r2: '70', r1: '60', r0: '50',
      }),
    ).toBe(true);
  });

  it('numeric KPI with one threshold defined → true', () => {
    expect(
      kpiHasScoringLogic({ uom_type: 'numeric', r3: '80' } as any),
    ).toBe(true);
  });

  it('numeric KPI with all R blank → false', () => {
    expect(
      kpiHasScoringLogic({
        uom_type: 'numeric',
        r5: '', r4: null, r3: undefined as any, r2: '', r1: '', r0: '',
      }),
    ).toBe(false);
  });

  it('binary KPI with qualitative_options → true', () => {
    expect(
      kpiHasScoringLogic({
        uom_type: 'binary',
        qualitative_options: [
          { label: 'Yes', score: 5 },
          { label: 'No', score: 0 },
        ],
      }),
    ).toBe(true);
  });

  it('binary KPI with empty qualitative_options → false', () => {
    expect(
      kpiHasScoringLogic({ uom_type: 'binary', qualitative_options: [] }),
    ).toBe(false);
  });

  it('binary KPI with null qualitative_options → false', () => {
    expect(
      kpiHasScoringLogic({ uom_type: 'binary', qualitative_options: null }),
    ).toBe(false);
  });

  it('tiered KPI with 3 tiers → true', () => {
    expect(
      kpiHasScoringLogic({
        uom_type: 'tiered',
        qualitative_options: [
          { label: 'Gold', score: 5 },
          { label: 'Silver', score: 3 },
          { label: 'Bronze', score: 1 },
        ],
      }),
    ).toBe(true);
  });

  it('binary KPI ignores R thresholds even if present', () => {
    expect(
      kpiHasScoringLogic({
        uom_type: 'binary',
        qualitative_options: [],
        r5: '100',
      }),
    ).toBe(false);
  });

  it('unknown uom_type defaults to numeric branch', () => {
    expect(
      kpiHasScoringLogic({ uom_type: 'percentage' as any, r5: '100' }),
    ).toBe(true);
    expect(
      kpiHasScoringLogic({ uom_type: 'percentage' as any }),
    ).toBe(false);
  });

  it('missing uom_type defaults to numeric', () => {
    expect(kpiHasScoringLogic({ r5: '100' })).toBe(true);
    expect(kpiHasScoringLogic({})).toBe(false);
  });
});