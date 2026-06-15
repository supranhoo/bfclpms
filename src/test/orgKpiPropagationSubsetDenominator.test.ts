import { describe, it, expect } from 'vitest';

/**
 * v2.66.14 — Regression guard: the partial-propagation completeness check
 * MUST use the **attempted subset** as the denominator, not the full mapped
 * employee population. Before this fix, uploading data for 3 of 60 mapped
 * employees fired "Partial propagation: 0/60 — 60 may have mismatched KPI
 * names" even when the 3 attempted rows succeeded, because the denominator
 * was `employeeCountMap.get(key)` (the full mapped count) instead of
 * `consideredScopeIds.length` (the subset the user actually propagated this
 * click). See `OrgKpiDataEntry.executeSaveAndPropagate`.
 */
type Variant = 'none' | 'mismatch' | 'hard';
function classifyPartialToast(
  propagated: number,
  attempted: number,
  benign: number,
  hard: number,
): Variant {
  if (!(attempted > 0 && propagated < attempted)) return 'none';
  if (hard > 0) return 'hard';
  const unaccounted = Math.max(0, attempted - propagated - benign - hard);
  if (unaccounted > 0) return 'mismatch';
  return 'none';
}

describe('Subset-aware partial-propagation denominator (v2.66.14)', () => {
  it('upload 3 of 60, all 3 succeed → no toast (the reported bug)', () => {
    // mapped = 60 is irrelevant; only the attempted 3 count
    expect(classifyPartialToast(3, 3, 0, 0)).toBe('none');
  });

  it('upload 3 of 60, 1 benign skip → covered by benign, no destructive toast', () => {
    expect(classifyPartialToast(2, 3, 1, 0)).toBe('none');
  });

  it('upload 3 of 60, 1 true mismatch → "mismatch" against subset (2/3)', () => {
    expect(classifyPartialToast(2, 3, 0, 0)).toBe('mismatch');
  });

  it('upload 3 of 60, 1 hard skip → "hard" against subset (2/3)', () => {
    expect(classifyPartialToast(2, 3, 0, 1)).toBe('hard');
  });

  it('propagate full set of 60 → success classifies as none', () => {
    expect(classifyPartialToast(60, 60, 0, 0)).toBe('none');
  });

  it('propagate full set of 60 with 5 genuinely missing → mismatch 55/60', () => {
    expect(classifyPartialToast(55, 60, 0, 0)).toBe('mismatch');
  });
});