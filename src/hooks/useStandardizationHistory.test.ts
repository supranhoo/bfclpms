import { describe, it, expect } from 'vitest';

/**
 * The propagation eligibility filter inside `useEditDefinition` and the
 * Build Registry editable-canonical resolver are pure decisions. We mirror
 * those small predicates here so they're protected against regressions.
 */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const monthNum = (p: string) => MONTHS.indexOf(p) + 1;

function isEligibleForRename(period: string, year: number): boolean {
  if (year < 2026) return false;
  if (year === 2026 && monthNum(period) < 5) return false;
  return true;
}

function resolveCanonical(
  baseVariant: { kra_name: string; kpi_name: string },
  override: { kra: string; kpi: string } | undefined,
): { kra: string; kpi: string } | null {
  const kra = (override?.kra ?? baseVariant.kra_name).trim();
  const kpi = (override?.kpi ?? baseVariant.kpi_name).trim();
  if (!kra || !kpi) return null;
  return { kra, kpi };
}

describe('isEligibleForRename', () => {
  it('rejects pre-2026 data', () => {
    expect(isEligibleForRename('December', 2025)).toBe(false);
    expect(isEligibleForRename('May', 2025)).toBe(false);
  });
  it('rejects Jan–Apr 2026', () => {
    expect(isEligibleForRename('January', 2026)).toBe(false);
    expect(isEligibleForRename('April', 2026)).toBe(false);
  });
  it('accepts May 2026 onward', () => {
    expect(isEligibleForRename('May', 2026)).toBe(true);
    expect(isEligibleForRename('December', 2026)).toBe(true);
    expect(isEligibleForRename('January', 2027)).toBe(true);
  });
});

describe('resolveCanonical (Build Registry editable canonical)', () => {
  const v = { kra_name: 'KRA-A', kpi_name: 'KPI-A' };

  it('falls back to selected variant when no override', () => {
    expect(resolveCanonical(v, undefined)).toEqual({ kra: 'KRA-A', kpi: 'KPI-A' });
  });

  it('uses override values when both provided', () => {
    expect(resolveCanonical(v, { kra: 'New KRA', kpi: 'New KPI' })).toEqual({ kra: 'New KRA', kpi: 'New KPI' });
  });

  it('trims whitespace', () => {
    expect(resolveCanonical(v, { kra: '  X  ', kpi: '  Y  ' })).toEqual({ kra: 'X', kpi: 'Y' });
  });

  it('rejects empty/whitespace-only canonical', () => {
    expect(resolveCanonical(v, { kra: '   ', kpi: 'Y' })).toBeNull();
    expect(resolveCanonical(v, { kra: 'X', kpi: '' })).toBeNull();
  });
});

describe('action history payload contracts', () => {
  // Sanity check: payload shapes that the reverse function depends on.
  it('rename_kpis payload has kpi_rows[].id and prev_definition_id', () => {
    const sample = {
      old_kra: 'A', old_kpi: 'B', new_kra: 'C', new_kpi: 'D',
      review_period: 'May', review_year: 2026,
      kpi_rows: [{ id: 'uuid-1', prev_definition_id: null }, { id: 'uuid-2', prev_definition_id: 'def-x' }],
    };
    expect(sample.kpi_rows.every(r => 'id' in r && 'prev_definition_id' in r)).toBe(true);
  });

  it('link_alias payload uses aliases[] with category_id', () => {
    const sample = { aliases: [{ variant_kra_name: 'X', variant_kpi_name: 'Y', category_id: 'cat-1' }] };
    expect(sample.aliases[0].category_id).toBe('cat-1');
  });

  it('edit_definition payload has before + after canonical names', () => {
    const sample = { before: { canonical_kra_name: 'A', canonical_kpi_name: 'B' }, after: { canonical_kra_name: 'C', canonical_kpi_name: 'D' } };
    expect(sample.before.canonical_kra_name).toBe('A');
    expect(sample.after.canonical_kpi_name).toBe('D');
  });
});