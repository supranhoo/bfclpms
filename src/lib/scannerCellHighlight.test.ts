import { describe, it, expect } from 'vitest';
import { modeValue, pageModes, columnHasVariety, isOutlier } from './scannerCellHighlight';

describe('scannerCellHighlight', () => {
  it('modeValue returns null for empty input', () => {
    expect(modeValue([])).toBeNull();
    expect(modeValue([null, undefined, '', '   '])).toBeNull();
  });

  it('modeValue picks most common value, case-insensitive', () => {
    expect(modeValue(['Monthly', 'monthly', 'Quarterly'])).toBe('Monthly');
  });

  it('modeValue resolves ties by first-seen', () => {
    expect(modeValue(['A', 'B', 'A', 'B'])).toBe('A');
    expect(modeValue(['B', 'A', 'B', 'A'])).toBe('B');
  });

  it('columnHasVariety detects 2+ distinct non-empty values', () => {
    expect(columnHasVariety(['x', 'x', 'x'])).toBe(false);
    expect(columnHasVariety(['x', null, 'x'])).toBe(false);
    expect(columnHasVariety(['x', 'y'])).toBe(true);
    expect(columnHasVariety(['X', 'x'])).toBe(false);
  });

  it('isOutlier suppresses on uniform column', () => {
    expect(isOutlier('x', 'x', false)).toBe(false);
  });

  it('isOutlier flags only differing non-empty cells', () => {
    expect(isOutlier('Quarterly', 'Monthly', true)).toBe(true);
    expect(isOutlier('Monthly', 'Monthly', true)).toBe(false);
    expect(isOutlier(null, 'Monthly', true)).toBe(false);
    expect(isOutlier('', 'Monthly', true)).toBe(false);
  });

  it('pageModes computes per-key mode', () => {
    const rows = [
      { frequency: 'Monthly', r0: '<98%' },
      { frequency: 'Monthly', r0: '<95%' },
      { frequency: 'Quarterly', r0: '<98%' },
    ];
    expect(pageModes(rows, ['frequency', 'r0'] as const)).toEqual({
      frequency: 'Monthly',
      r0: '<98%',
    });
  });
});
