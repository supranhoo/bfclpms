import { describe, it, expect } from 'vitest';
import { labelToRating, getQualitativeAchievedLabel, BINARY_OPTIONS } from '@/lib/qualitativeUom';

describe('Auditor draft qualitative round-trip', () => {
  it('labelToRating: binary "Yes" -> 5, "No" -> 0 with default options', () => {
    expect(labelToRating('Yes', 'binary', null)).toBe(5);
    expect(labelToRating('No', 'binary', null)).toBe(0);
  });

  it('labelToRating: respects inverted binary (Yes=0, No=5) for safety KPIs', () => {
    const inverted = [
      { label: 'Yes', rating: 0, definition: '' },
      { label: 'No', rating: 5, definition: '' },
    ];
    expect(labelToRating('Yes', 'binary', inverted)).toBe(0);
    expect(labelToRating('No', 'binary', inverted)).toBe(5);
  });

  it('labelToRating: unknown label returns null (caller falls back to score)', () => {
    expect(labelToRating('Maybe', 'binary', null)).toBeNull();
    expect(labelToRating(null, 'binary', null)).toBeNull();
    expect(labelToRating('', 'binary', null)).toBeNull();
  });

  it('labelToRating: passes numeric values through for numeric UOM', () => {
    expect(labelToRating(42, 'numeric', null)).toBe(42);
    expect(labelToRating('42', 'numeric', null)).toBe(42);
    expect(labelToRating('abc', 'numeric', null)).toBeNull();
  });

  it('labelToRating: never returns NaN (regression for parseFloat("Yes"))', () => {
    const result = labelToRating('Yes', 'binary', null);
    expect(Number.isFinite(result!)).toBe(true);
  });

  it('getQualitativeAchievedLabel: numeric rating -> label for binary', () => {
    expect(getQualitativeAchievedLabel(0, 'binary', null)).toBe('No');
    expect(getQualitativeAchievedLabel(5, 'binary', null)).toBe('Yes');
  });

  it('Hydration scenario: auditor saved Yes/0 draft with NULL achieved value, derives "Yes" from score', () => {
    // Simulates the production bug: auditor_score=0, auditor_achieved_value=null
    const auditorScore = 0;
    const storedAchieved = null;
    const numeric = storedAchieved ?? auditorScore;
    const label = getQualitativeAchievedLabel(numeric, 'binary', null);
    expect(label).toBe('No'); // default mapping: 0 -> No
    // With safety-inverted binary (Yes=0), the same numeric resolves to 'Yes'
    const inverted = [
      { label: 'Yes', rating: 0, definition: '' },
      { label: 'No', rating: 5, definition: '' },
    ];
    expect(getQualitativeAchievedLabel(numeric, 'binary', inverted)).toBe('Yes');
  });
});