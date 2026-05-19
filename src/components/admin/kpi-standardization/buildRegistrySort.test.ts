import { describe, it, expect } from 'vitest';
import { compareGroupsByMatch, sortGroupsByMatch } from './buildRegistrySort';

const g = (normalized_kpi: string, variants: Array<{ match_type?: 'exact' | 'fuzzy'; similarity?: number; row_count?: number }>) => ({
  normalized_kpi,
  variants: variants.map(v => ({
    kra_name: 'k', kpi_name: normalized_kpi, employee_count: 1, row_count: v.row_count ?? 1,
    match_type: v.match_type, similarity: v.similarity,
  })),
});

describe('compareGroupsByMatch', () => {
  it('puts exact groups above any fuzzy group', () => {
    const exact = g('a', [{ match_type: 'exact' }]);
    const fuzzy = g('b', [{ match_type: 'fuzzy', similarity: 0.99 }]);
    expect(sortGroupsByMatch([fuzzy, exact])[0]).toBe(exact);
  });

  it('sorts fuzzy groups by max similarity descending', () => {
    const low = g('a', [{ match_type: 'fuzzy', similarity: 0.4 }]);
    const high = g('b', [{ match_type: 'fuzzy', similarity: 0.9 }]);
    expect(sortGroupsByMatch([low, high])[0]).toBe(high);
  });

  it('tie on similarity → higher row_count wins', () => {
    const small = g('a', [{ match_type: 'fuzzy', similarity: 0.5, row_count: 3 }]);
    const big = g('b', [{ match_type: 'fuzzy', similarity: 0.5, row_count: 30 }]);
    expect(sortGroupsByMatch([small, big])[0]).toBe(big);
  });

  it('tie on similarity + row_count → alphabetical normalized_kpi', () => {
    const a = g('alpha', [{ match_type: 'fuzzy', similarity: 0.5, row_count: 1 }]);
    const b = g('beta', [{ match_type: 'fuzzy', similarity: 0.5, row_count: 1 }]);
    expect(sortGroupsByMatch([b, a])[0]).toBe(a);
  });

  it('uses max similarity across variants in a group', () => {
    const mixed = g('m', [
      { match_type: 'fuzzy', similarity: 0.4 },
      { match_type: 'fuzzy', similarity: 0.95 },
    ]);
    const single = g('s', [{ match_type: 'fuzzy', similarity: 0.8 }]);
    expect(compareGroupsByMatch(mixed, single)).toBeLessThan(0);
  });
});