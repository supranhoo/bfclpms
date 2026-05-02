import { describe, it, expect } from 'vitest';
import {
  matchesCanonicalKpi,
  preferredVariantRow,
  canonicalPair,
  type VariantPair,
} from './canonicalRelatedKpis';

const mkKpi = (overrides: Partial<{ id: string; employee_id: string; kra_name: string; kpi_name: string }> = {}) => ({
  id: 'k1',
  employee_id: 'emp-1',
  kra_name: 'Business Analytics (Organisation Level)',
  kpi_name: 'Days compliance for report',
  ...overrides,
});

describe('matchesCanonicalKpi', () => {
  const current = mkKpi();

  it('falls back to strict equality when variantPairs is empty', () => {
    expect(matchesCanonicalKpi(mkKpi(), current, [])).toBe(true);
    expect(
      matchesCanonicalKpi(mkKpi({ kpi_name: 'Days compliance' }), current, []),
    ).toBe(false);
  });

  it('matches canonical and every alias variant case-insensitively', () => {
    const variants: VariantPair[] = [
      { kra_name: 'Business Analytics (Organisation Level)', kpi_name: 'Days compliance for report' },
      { kra_name: 'Business Analytics', kpi_name: 'Days compliance' },
      { kra_name: 'BUSINESS ANALYTICS  ', kpi_name: '  days COMPLIANCE for REPORT  ' },
    ];
    expect(
      matchesCanonicalKpi(
        mkKpi({ kra_name: 'business analytics', kpi_name: 'days compliance' }),
        current,
        variants,
      ),
    ).toBe(true);
    expect(
      matchesCanonicalKpi(
        mkKpi({ kra_name: 'Business Analytics', kpi_name: 'Unrelated KPI' }),
        current,
        variants,
      ),
    ).toBe(false);
  });

  it('rejects rows from a different employee even when names match', () => {
    const variants: VariantPair[] = [
      { kra_name: current.kra_name, kpi_name: current.kpi_name },
    ];
    expect(
      matchesCanonicalKpi(mkKpi({ employee_id: 'emp-2' }), current, variants),
    ).toBe(false);
    // strict-equality fallback also rejects
    expect(
      matchesCanonicalKpi(mkKpi({ employee_id: 'emp-2' }), current, []),
    ).toBe(false);
  });
});

describe('preferredVariantRow', () => {
  const variants: VariantPair[] = [
    { kra_name: 'Business Analytics (Organisation Level)', kpi_name: 'Days compliance for report' },
    { kra_name: 'Business Analytics', kpi_name: 'Days compliance' },
  ];

  it('prefers the row matching the canonical pair', () => {
    const aliasRow = mkKpi({ id: 'a', kra_name: 'Business Analytics', kpi_name: 'Days compliance' });
    const canonRow = mkKpi({ id: 'c' });
    expect(preferredVariantRow([aliasRow, canonRow], variants, null).id).toBe('c');
  });

  it('falls back to currentKpiId when no canonical row present', () => {
    const r1 = mkKpi({ id: 'a', kra_name: 'Business Analytics', kpi_name: 'Days compliance' });
    const r2 = mkKpi({ id: 'b', kra_name: 'Business Analytics', kpi_name: 'Days compliance' });
    expect(preferredVariantRow([r1, r2], variants, 'b').id).toBe('b');
  });

  it('returns the first row as last-resort tiebreaker', () => {
    const r1 = mkKpi({ id: 'a', kra_name: 'Other', kpi_name: 'Other' });
    const r2 = mkKpi({ id: 'b', kra_name: 'Other', kpi_name: 'Other' });
    expect(preferredVariantRow([r1, r2], [], null).id).toBe('a');
  });

  it('canonicalPair returns first variant or null', () => {
    expect(canonicalPair(variants)?.kpi_name).toBe('Days compliance for report');
    expect(canonicalPair([])).toBeNull();
  });
});