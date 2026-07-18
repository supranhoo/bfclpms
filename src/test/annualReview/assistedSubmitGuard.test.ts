import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasAnyNumericCriterion } from '@/lib/annualReview/hasScoredSelf';

describe('hasAnyNumericCriterion (ADR-115)', () => {
  it('returns false for null / undefined / non-objects', () => {
    expect(hasAnyNumericCriterion(null)).toBe(false);
    expect(hasAnyNumericCriterion(undefined)).toBe(false);
    expect(hasAnyNumericCriterion('x')).toBe(false);
    expect(hasAnyNumericCriterion(42)).toBe(false);
    expect(hasAnyNumericCriterion([])).toBe(false);
  });

  it('returns false for empty object or all-null values', () => {
    expect(hasAnyNumericCriterion({})).toBe(false);
    expect(hasAnyNumericCriterion({ a: null, b: null })).toBe(false);
  });

  it('returns true as soon as one numeric value exists', () => {
    expect(hasAnyNumericCriterion({ a: 3 })).toBe(true);
    expect(hasAnyNumericCriterion({ a: null, b: 5 })).toBe(true);
  });

  it('counts 0 as scored (safety-binary KPIs)', () => {
    expect(hasAnyNumericCriterion({ a: 0 })).toBe(true);
  });

  it('ignores string values, NaN and Infinity', () => {
    expect(hasAnyNumericCriterion({ a: '5' })).toBe(false);
    expect(hasAnyNumericCriterion({ a: Number.NaN })).toBe(false);
    expect(hasAnyNumericCriterion({ a: Infinity })).toBe(false);
  });
});

describe('Assisted Submission dialog wires the ADR-115 guard', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../../components/annual-review/AssistedSubmissionDialog.tsx'),
    'utf8',
  );

  it('no longer uses weighted_score as the guard signal', () => {
    expect(src).not.toMatch(/\.not\('weighted_score'/);
  });

  it('uses hasAnyNumericCriterion helper', () => {
    expect(src).toMatch(/hasAnyNumericCriterion/);
    expect(src).toMatch(/criteria_scores/);
  });
});