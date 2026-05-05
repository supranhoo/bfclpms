import { describe, it, expect } from 'vitest';

/**
 * Regression guard for the v2.66.10 "skip-aware partial-propagation" toast.
 *
 * Before the fix, `OrgKpiDataEntry.executeSaveAndPropagate` unconditionally
 * fired a destructive "Partial propagation … may have mismatched KPI names"
 * toast whenever totalPropagated < expectedCount, even when every skip was a
 * benign `not_in_kra_set` (employee already self-reviewed). This caused the
 * false-alarm Vivek Kumar Dansena reported (8 matched / 0 advance / 8 skip
 * "already past initial stage" → red toast claiming KPI-name mismatch).
 *
 * The pure predicate below mirrors the new branching contract. Keep this in
 * sync with the code block in OrgKpiDataEntry.tsx.
 */
type Variant = 'none' | 'mismatch' | 'hard';
function classifyPartialToast(
  propagated: number,
  expected: number,
  benign: number,
  hard: number,
): Variant {
  if (!(expected > 0 && propagated < expected)) return 'none';
  if (hard > 0) return 'hard';
  const unaccounted = Math.max(0, expected - propagated - benign - hard);
  if (unaccounted > 0) return 'mismatch';
  return 'none';
}

describe('PA3 partial-propagation toast classification (v2.66.10)', () => {
  it('all 8 skips benign → no destructive toast (the reported bug)', () => {
    expect(classifyPartialToast(0, 8, 8, 0)).toBe('none');
  });

  it('full propagation → no toast', () => {
    expect(classifyPartialToast(8, 8, 0, 0)).toBe('none');
  });

  it('hard skips present → "hard" variant takes precedence', () => {
    expect(classifyPartialToast(5, 8, 0, 3)).toBe('hard');
    expect(classifyPartialToast(5, 8, 1, 2)).toBe('hard');
  });

  it('truly unaccounted gap → "mismatch" toast (legitimate KPI-name drift)', () => {
    expect(classifyPartialToast(5, 8, 0, 0)).toBe('mismatch');
    expect(classifyPartialToast(5, 8, 1, 0)).toBe('mismatch');
  });

  it('benign covers the gap exactly → no toast', () => {
    expect(classifyPartialToast(3, 8, 5, 0)).toBe('none');
  });
});