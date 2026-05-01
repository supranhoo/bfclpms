import { describe, it, expect } from 'vitest';
import {
  nk,
  signatureKey,
  canonicalGroupKey,
  canonicalDisplayNames,
  groupByCanonicalKey,
  aliasesForGroup,
  type CanonicalResolution,
} from './canonicalGrouping';

const CAT = '00000000-0000-0000-0000-000000000001';
const DEF = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildResolver(entries: Array<{
  category_id: string; kra_name: string; kpi_name: string;
  definition_id: string | null; canonical_kra: string | null; canonical_kpi: string | null;
}>): Map<string, CanonicalResolution> {
  const map = new Map<string, CanonicalResolution>();
  for (const e of entries) {
    map.set(signatureKey({ category_id: e.category_id, kra_name: e.kra_name, kpi_name: e.kpi_name }), {
      definition_id: e.definition_id,
      canonical_kra_name: e.canonical_kra,
      canonical_kpi_name: e.canonical_kpi,
    });
  }
  return map;
}

describe('nk', () => {
  it('lowercases, trims, and collapses internal whitespace', () => {
    expect(nk('  Control   Dust  Emission ')).toBe('control dust emission');
    expect(nk(null)).toBe('');
    expect(nk(undefined)).toBe('');
  });
});

describe('signatureKey', () => {
  it('produces stable key regardless of casing/whitespace differences', () => {
    expect(signatureKey({ category_id: CAT, kra_name: 'Control Dust Emission', kpi_name: 'PM10' }))
      .toBe(signatureKey({ category_id: CAT, kra_name: 'control  dust emission', kpi_name: 'pm10' }));
  });
});

describe('canonicalGroupKey', () => {
  const resolver = buildResolver([
    { category_id: CAT, kra_name: 'Control dust emission', kpi_name: 'PM10', definition_id: DEF, canonical_kra: 'Control Dust Emission', canonical_kpi: 'PM10' },
    { category_id: CAT, kra_name: 'Environment compliance', kpi_name: 'PM10', definition_id: DEF, canonical_kra: 'Control Dust Emission', canonical_kpi: 'PM10' },
  ]);

  it('groups two variants under the same definition key', () => {
    const k1 = canonicalGroupKey({ category_id: CAT, kra_name: 'Control dust emission', kpi_name: 'PM10' }, resolver);
    const k2 = canonicalGroupKey({ category_id: CAT, kra_name: 'Environment compliance', kpi_name: 'PM10' }, resolver);
    expect(k1).toBe(`def:${DEF}`);
    expect(k1).toBe(k2);
  });

  it('falls back to a normalized raw key when unmatched', () => {
    const k = canonicalGroupKey({ category_id: CAT, kra_name: 'Brand New KRA', kpi_name: 'X' }, resolver);
    expect(k).toBe(`raw:${CAT}|brand new kra|x`);
  });

  it('treats different categories as different groups even with same names', () => {
    const otherCat = '99999999-9999-9999-9999-999999999999';
    const k1 = canonicalGroupKey({ category_id: CAT, kra_name: 'Foo', kpi_name: 'Bar' }, resolver);
    const k2 = canonicalGroupKey({ category_id: otherCat, kra_name: 'Foo', kpi_name: 'Bar' }, resolver);
    expect(k1).not.toBe(k2);
  });
});

describe('canonicalDisplayNames', () => {
  const resolver = buildResolver([
    { category_id: CAT, kra_name: 'Control dust emission', kpi_name: 'PM10', definition_id: DEF, canonical_kra: 'Control Dust Emission', canonical_kpi: 'PM10 (Cleaned)' },
  ]);

  it('returns canonical names when matched', () => {
    const r = canonicalDisplayNames({ category_id: CAT, kra_name: 'Control dust emission', kpi_name: 'PM10' }, resolver);
    expect(r.isCanonical).toBe(true);
    expect(r.kra_name).toBe('Control Dust Emission');
    expect(r.kpi_name).toBe('PM10 (Cleaned)');
  });

  it('returns the row\'s own names when unmatched', () => {
    const r = canonicalDisplayNames({ category_id: CAT, kra_name: 'Unknown', kpi_name: 'Unknown' }, resolver);
    expect(r.isCanonical).toBe(false);
    expect(r.kra_name).toBe('Unknown');
  });
});

describe('groupByCanonicalKey', () => {
  const resolver = buildResolver([
    { category_id: CAT, kra_name: 'Control dust emission', kpi_name: 'PM10', definition_id: DEF, canonical_kra: 'Control Dust Emission', canonical_kpi: 'PM10' },
    { category_id: CAT, kra_name: 'Environment compliance',  kpi_name: 'PM10', definition_id: DEF, canonical_kra: 'Control Dust Emission', canonical_kpi: 'PM10' },
  ]);

  it('collapses matched variants into one bucket and keeps unmatched separate', () => {
    const rows = [
      { id: 1, signature: { category_id: CAT, kra_name: 'Control dust emission', kpi_name: 'PM10' } },
      { id: 2, signature: { category_id: CAT, kra_name: 'Environment compliance',  kpi_name: 'PM10' } },
      { id: 3, signature: { category_id: CAT, kra_name: 'Other KRA',               kpi_name: 'OtherKPI' } },
    ];
    const grouped = groupByCanonicalKey(rows, resolver);
    expect(grouped.size).toBe(2);
    const canonicalBucket = grouped.get(`def:${DEF}`);
    expect(canonicalBucket?.length).toBe(2);
    expect(canonicalBucket?.map(r => r.id).sort()).toEqual([1, 2]);
  });
});

describe('aliasesForGroup', () => {
  it('lists variant texts excluding the canonical one', () => {
    const rows = [
      { id: 1, signature: { category_id: CAT, kra_name: 'Control Dust Emission', kpi_name: 'PM10' } },
      { id: 2, signature: { category_id: CAT, kra_name: 'Control dust emission', kpi_name: 'PM10' } },
      { id: 3, signature: { category_id: CAT, kra_name: 'Environment compliance', kpi_name: 'PM10' } },
    ];
    const result = aliasesForGroup(rows, 'Control Dust Emission', 'PM10');
    // Canonical row is omitted; lowercase-variant of canonical is also omitted (same nk)
    expect(result).toEqual(['Environment compliance / PM10']);
  });
});