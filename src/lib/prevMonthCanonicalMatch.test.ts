import { describe, it, expect } from 'vitest';
import {
  buildPairKeySet,
  isAllowedPair,
  isRenamedFromCurrent,
} from './prevMonthCanonicalMatch';

describe('buildPairKeySet', () => {
  it('normalizes whitespace and case', () => {
    const set = buildPairKeySet([
      { kra_name: 'Safety', kpi_name: 'Control Dust Emission' },
      { kra_name: '  safety  ', kpi_name: 'control  dust   emission' },
    ]);
    expect(set.size).toBe(1);
    expect(set.has('safety|control dust emission')).toBe(true);
  });
});

describe('isAllowedPair', () => {
  const pairKeys = buildPairKeySet([
    { kra_name: 'Safety', kpi_name: 'Control Dust Emission' },
    { kra_name: 'Environment', kpi_name: 'Compliance' },
  ]);

  it('accepts an exact canonical pair', () => {
    expect(isAllowedPair({ kra_name: 'Safety', kpi_name: 'Control Dust Emission' }, pairKeys)).toBe(true);
  });

  it('accepts an alias variant pair', () => {
    expect(isAllowedPair({ kra_name: 'Environment', kpi_name: 'Compliance' }, pairKeys)).toBe(true);
  });

  it('rejects Cartesian-product false positives (kraA + kpiB)', () => {
    // Both names appear in the variant set, but never together as a real pair.
    expect(isAllowedPair({ kra_name: 'Safety', kpi_name: 'Compliance' }, pairKeys)).toBe(false);
    expect(isAllowedPair({ kra_name: 'Environment', kpi_name: 'Control Dust Emission' }, pairKeys)).toBe(false);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(isAllowedPair({ kra_name: 'SAFETY', kpi_name: '  control dust  emission ' }, pairKeys)).toBe(true);
  });
});

describe('isRenamedFromCurrent', () => {
  const current = { kra_name: 'Safety', kpi_name: 'Control Dust Emission' };

  it('returns false when the row matches the current KPI exactly', () => {
    expect(isRenamedFromCurrent({ kra_name: 'Safety', kpi_name: 'Control Dust Emission' }, current)).toBe(false);
  });

  it('returns false when only whitespace/case differs', () => {
    expect(isRenamedFromCurrent({ kra_name: 'safety', kpi_name: 'control dust emission' }, current)).toBe(false);
  });

  it('returns true when the historical KPI used a different name', () => {
    expect(isRenamedFromCurrent({ kra_name: 'Environment', kpi_name: 'Compliance' }, current)).toBe(true);
  });
});