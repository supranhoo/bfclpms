import { describe, it, expect } from 'vitest';
import { dedupeVariants, dedupeScannerGroups } from './scanGroupsDedup';

describe('dedupeVariants', () => {
  it('collapses identical (kra,kpi) entries to a single variant', () => {
    const variants = Array.from({ length: 8 }, () => ({
      kra_name: 'Account settlement for rake logistics',
      kpi_name: 'Days taken for reco. - Scoring',
      employee_count: 1,
      row_count: 8,
    }));
    const out = dedupeVariants(variants);
    expect(out).toHaveLength(1);
    expect(out[0].employee_count).toBe(1);
    expect(out[0].row_count).toBe(8);
  });

  it('treats case/whitespace differences as the same variant', () => {
    const out = dedupeVariants([
      { kra_name: ' Account Settlement ', kpi_name: 'X', employee_count: 1, row_count: 5 },
      { kra_name: 'account settlement',   kpi_name: 'x', employee_count: 2, row_count: 7 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].employee_count).toBe(2);
    expect(out[0].row_count).toBe(7);
  });

  it('preserves genuinely distinct variants', () => {
    const out = dedupeVariants([
      { kra_name: 'KRA A', kpi_name: 'KPI 1', employee_count: 1, row_count: 8 },
      { kra_name: 'KRA B', kpi_name: 'KPI 1', employee_count: 1, row_count: 8 },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('dedupeScannerGroups', () => {
  it('dedupes within each group while preserving group identity', () => {
    const groups = [{
      normalized_kpi: 'kpi 1',
      category_id: 'c1',
      category_name: 'Cat 1',
      variants: [
        { kra_name: 'A', kpi_name: 'KPI 1', employee_count: 1, row_count: 8 },
        { kra_name: 'A', kpi_name: 'KPI 1', employee_count: 1, row_count: 8 },
        { kra_name: 'B', kpi_name: 'KPI 1', employee_count: 1, row_count: 8 },
      ],
    }];
    const out = dedupeScannerGroups(groups);
    expect(out[0].variants).toHaveLength(2);
    expect(out[0].category_id).toBe('c1');
  });
});

describe('dedupeVariants — fuzzy match metadata', () => {
  it('preserves match_type and similarity on first sight', () => {
    const out = dedupeVariants([
      { kra_name: 'A', kpi_name: 'X', employee_count: 1, row_count: 1, match_type: 'exact', similarity: 1 },
      { kra_name: 'B', kpi_name: 'Y', employee_count: 1, row_count: 1, match_type: 'fuzzy', similarity: 0.62 },
    ]);
    expect(out).toHaveLength(2);
    expect(out.find(v => v.kpi_name === 'X')?.match_type).toBe('exact');
    expect(out.find(v => v.kpi_name === 'Y')?.match_type).toBe('fuzzy');
    expect(out.find(v => v.kpi_name === 'Y')?.similarity).toBe(0.62);
  });

  it('upgrades match_type from fuzzy → exact when the same variant arrives twice', () => {
    const out = dedupeVariants([
      { kra_name: 'A', kpi_name: 'X', employee_count: 1, row_count: 1, match_type: 'fuzzy', similarity: 0.6 },
      { kra_name: 'A', kpi_name: 'X', employee_count: 1, row_count: 1, match_type: 'exact', similarity: 1 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].match_type).toBe('exact');
    expect(out[0].similarity).toBe(1);
  });

  it('keeps the highest similarity when collapsing duplicates', () => {
    const out = dedupeVariants([
      { kra_name: 'A', kpi_name: 'X', employee_count: 1, row_count: 1, match_type: 'fuzzy', similarity: 0.55 },
      { kra_name: 'A', kpi_name: 'X', employee_count: 1, row_count: 1, match_type: 'fuzzy', similarity: 0.78 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].similarity).toBe(0.78);
  });
});
