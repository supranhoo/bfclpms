/** ADR-271 — KPI type awareness must be uniform across every surface. */
import { describe, it, expect } from 'vitest';
import {
  resolveKpiScoringModel,
  labelToRatingFromModel,
  isMixedScoringGroup,
  KPI_TYPE_LABELS,
} from '@/lib/kpiScoringModel';

describe('resolveKpiScoringModel', () => {
  it('reads numeric thresholds high → low and drops blanks', () => {
    const m = resolveKpiScoringModel({ uom_type: 'numeric', r5: '100', r3: '80', r1: '', r0: null });
    expect(m.type).toBe('numeric');
    expect(m.thresholds.map(t => t.label)).toEqual(['R5', 'R3']);
  });

  it('flags a numeric KPI with no thresholds as unconfigured, not scored', () => {
    expect(resolveKpiScoringModel({ uom_type: 'numeric' }).type).toBe('unconfigured');
  });

  it('never renders a binary KPI as a 0-5 threshold grid', () => {
    const m = resolveKpiScoringModel({
      uom_type: 'binary',
      qualitative_options: [{ label: 'No', rating: 0 }, { label: 'Yes', rating: 5 }],
    });
    expect(m.type).toBe('binary');
    expect(m.thresholds).toHaveLength(0);
    expect(m.options.map(o => o.label)).toEqual(['Yes', 'No']);
  });

  it('honours inverted safety binaries (No = 5) instead of the default pair', () => {
    const m = resolveKpiScoringModel({
      uom_type: 'binary',
      qualitative_options: [{ label: 'Yes', rating: 0 }, { label: 'No', rating: 5 }],
    });
    expect(m.options[0]).toMatchObject({ label: 'No', rating: 5 });
    expect(labelToRatingFromModel(m, 'Yes')).toBe(0);
  });

  it('falls back to canonical Yes/No only when a binary KPI stores nothing', () => {
    const m = resolveKpiScoringModel({ uom_type: 'binary', qualitative_options: null });
    expect(m.type).toBe('binary');
    expect(m.options).toHaveLength(2);
  });

  it('sorts tiered options high → low and reports unconfigured empties', () => {
    const tiered = resolveKpiScoringModel({
      uom_type: 'tiered',
      qualitative_options: [{ label: 'Bronze', rating: 1 }, { label: 'Gold', rating: 5 }],
    });
    expect(tiered.options.map(o => o.rating)).toEqual([5, 1]);
    expect(resolveKpiScoringModel({ uom_type: 'tiered', qualitative_options: [] }).type)
      .toBe('unconfigured');
  });

  it('treats a missing uom_type as numeric', () => {
    expect(resolveKpiScoringModel({ r5: '10' }).uomType).toBe('numeric');
  });

  it('labels all three KPI types for users', () => {
    expect(Object.keys(KPI_TYPE_LABELS).sort()).toEqual(['binary', 'numeric', 'tiered']);
  });

  it('returns null rating for an unknown label', () => {
    const m = resolveKpiScoringModel({ uom_type: 'binary', qualitative_options: null });
    expect(labelToRatingFromModel(m, 'Maybe')).toBeNull();
    expect(labelToRatingFromModel(m, null)).toBeNull();
  });
});

describe('isMixedScoringGroup', () => {
  it('detects a title mapped with more than one KPI type', () => {
    expect(isMixedScoringGroup(['numeric', 'binary'])).toBe(true);
  });
  it('is false for a single type or missing data', () => {
    expect(isMixedScoringGroup(['binary', 'binary'])).toBe(false);
    expect(isMixedScoringGroup(null)).toBe(false);
  });
});
