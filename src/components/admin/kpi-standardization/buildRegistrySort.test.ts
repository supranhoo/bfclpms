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
  it('pure-exact group (score 1) outranks weaker fuzzy group', () => {
    const exact = g('a', [{ match_type: 'exact' }]);
    const fuzzy = g('b', [
      { match_type: 'exact', similarity: 1 },           // representative
      { match_type: 'fuzzy', similarity: 0.5 },
    ]);
    expect(sortGroupsByMatch([fuzzy, exact])[0]).toBe(exact);
  });

  it('ignores the cluster representative (similarity=1) when ranking fuzzy groups', () => {
    // Real scanner shape: every group has a representative variant with
    // similarity=1.0. Ranking must use the strongest *fuzzy* variant only.
    const weak = g('a', [
      { match_type: 'exact', similarity: 1 },
      { match_type: 'fuzzy', similarity: 0.4 },
    ]);
    const strong = g('b', [
      { match_type: 'exact', similarity: 1 },
      { match_type: 'fuzzy', similarity: 0.95 },
    ]);
    expect(sortGroupsByMatch([weak, strong])[0]).toBe(strong);
  });

  it('sorts fuzzy groups by max fuzzy similarity descending', () => {
    const low = g('a', [{ match_type: 'fuzzy', similarity: 0.4 }]);
    const high = g('b', [{ match_type: 'fuzzy', similarity: 0.9 }]);
    expect(sortGroupsByMatch([low, high])[0]).toBe(high);
  });

  it('reproduces user-reported sequence Exact, 40%, 100%, 46%, 46%, 49% → sorted 100%, Exact, 49%, 46%, 46%, 40%', () => {
    const exactOnly = g('exact', [{ match_type: 'exact' }]);
    const f40 = g('f40', [{ match_type: 'exact', similarity: 1 }, { match_type: 'fuzzy', similarity: 0.40 }]);
    const f100 = g('f100', [{ match_type: 'exact', similarity: 1 }, { match_type: 'fuzzy', similarity: 1.0 }]);
    const f46a = g('f46a', [{ match_type: 'exact', similarity: 1 }, { match_type: 'fuzzy', similarity: 0.46 }]);
    const f46b = g('f46b', [{ match_type: 'exact', similarity: 1 }, { match_type: 'fuzzy', similarity: 0.46 }]);
    const f49 = g('f49', [{ match_type: 'exact', similarity: 1 }, { match_type: 'fuzzy', similarity: 0.49 }]);
    const sorted = sortGroupsByMatch([exactOnly, f40, f100, f46a, f46b, f49]);
    // 100 and exact-only tie at score 1 → order between them is row-count/alpha,
    // but both must precede the 49/46/46/40 tail.
    expect(sorted.slice(0, 2)).toEqual(expect.arrayContaining([exactOnly, f100]));
    expect(sorted[2]).toBe(f49);
    expect(sorted.slice(3, 5)).toEqual(expect.arrayContaining([f46a, f46b]));
    expect(sorted[5]).toBe(f40);
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