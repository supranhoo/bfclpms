import { describe, it, expect } from 'vitest';
import { fmt2, fmtFloor2, safeParseFloat } from './utils';

describe('fmt2 — POLICY §UI-SCORE-PRECISION', () => {
  it('renders two decimals for /5 scores', () => {
    expect(fmt2(4.75)).toBe('4.75');
    expect(fmt2(4.8)).toBe('4.80');
    expect(fmt2(5)).toBe('5.00');
  });

  it('preserves zero', () => {
    expect(fmt2(0)).toBe('0.00');
  });

  it('returns an em dash for missing or non-numeric values', () => {
    expect(fmt2(null)).toBe('—');
    expect(fmt2(undefined)).toBe('—');
    expect(fmt2('')).toBe('—');
    expect(fmt2('abc')).toBe('—');
  });

  it('accepts numeric strings', () => {
    expect(fmt2('3.456')).toBe('3.46');
  });
});

describe('fmtFloor2', () => {
  it('never rounds up', () => {
    expect(fmtFloor2(4.789)).toBe('4.78');
    expect(fmtFloor2(null)).toBe('—');
  });
});

describe('safeParseFloat', () => {
  it('keeps zero and rejects blanks', () => {
    expect(safeParseFloat('0')).toBe(0);
    expect(safeParseFloat('')).toBeNull();
  });
});
