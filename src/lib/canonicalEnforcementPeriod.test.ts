import { describe, it, expect } from 'vitest';

/**
 * Phase 2b: Mirror unit tests for the DB function
 * `is_canonical_enforcement_period(period, year)`.
 *
 * These tests document the canonical contract — the DB is the source of
 * truth, but if any client-side logic ever needs to mirror this gate it
 * MUST behave identically.
 */
function isCanonicalEnforcementPeriod(period: string | null, year: number | null): boolean {
  if (year == null || period == null) return false;
  if (year > 2026) return true;
  if (year < 2026) return false;
  return ['may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
    .includes(period.toLowerCase());
}

describe('isCanonicalEnforcementPeriod (mirrors DB gate)', () => {
  it('returns false for any month in 2025', () => {
    expect(isCanonicalEnforcementPeriod('December', 2025)).toBe(false);
    expect(isCanonicalEnforcementPeriod('May', 2025)).toBe(false);
  });

  it('returns false for January–April 2026 (frozen historical window)', () => {
    expect(isCanonicalEnforcementPeriod('January', 2026)).toBe(false);
    expect(isCanonicalEnforcementPeriod('February', 2026)).toBe(false);
    expect(isCanonicalEnforcementPeriod('March', 2026)).toBe(false);
    expect(isCanonicalEnforcementPeriod('April', 2026)).toBe(false);
  });

  it('returns true for May 2026 onward in 2026', () => {
    expect(isCanonicalEnforcementPeriod('May', 2026)).toBe(true);
    expect(isCanonicalEnforcementPeriod('June', 2026)).toBe(true);
    expect(isCanonicalEnforcementPeriod('December', 2026)).toBe(true);
  });

  it('returns true for any month in years > 2026', () => {
    expect(isCanonicalEnforcementPeriod('January', 2027)).toBe(true);
    expect(isCanonicalEnforcementPeriod('April', 2030)).toBe(true);
  });

  it('is case-insensitive on the month', () => {
    expect(isCanonicalEnforcementPeriod('may', 2026)).toBe(true);
    expect(isCanonicalEnforcementPeriod('MAY', 2026)).toBe(true);
  });

  it('returns false on null/missing inputs', () => {
    expect(isCanonicalEnforcementPeriod(null, 2026)).toBe(false);
    expect(isCanonicalEnforcementPeriod('May', null)).toBe(false);
    expect(isCanonicalEnforcementPeriod(null, null)).toBe(false);
  });
});