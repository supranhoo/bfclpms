import { describe, expect, it } from 'vitest';
import { monthBounds } from '@/hooks/useDevReportEntries';

describe('monthBounds', () => {
  it('returns null for missing or malformed input', () => {
    expect(monthBounds(undefined)).toBeNull();
    expect(monthBounds(null)).toBeNull();
    expect(monthBounds('')).toBeNull();
    expect(monthBounds('2026-13')).toBeNull();
    expect(monthBounds('2026-00')).toBeNull();
    expect(monthBounds('2026/06')).toBeNull();
  });

  it('produces inclusive-from / exclusive-to bounds for a regular month', () => {
    expect(monthBounds('2026-06')).toEqual({
      from: '2026-06-01',
      toExclusive: '2026-07-01',
    });
  });

  it('rolls year over for December', () => {
    expect(monthBounds('2026-12')).toEqual({
      from: '2026-12-01',
      toExclusive: '2027-01-01',
    });
  });
});