/**
 * ADR-352a — the duplicate Org KPI card detector must only offer to rename
 * the non-canonical variants, and never the canonical name itself.
 */
import { describe, it, expect } from 'vitest';
import { nonCanonicalVariants, type SplitVariantGroup } from '@/hooks/useSplitKpiNameVariants';

const group = (variants: SplitVariantGroup['variants'], canonical: string): SplitVariantGroup => ({
  category_id: 'cat',
  category_name: 'Cost Management & Optimization',
  kra_name: 'Consumable cost',
  kpi_title: 'Consumable cost.:',
  variant_count: variants.length,
  open_rows: variants.reduce((s, v) => s + v.open_rows, 0),
  total_rows: variants.reduce((s, v) => s + v.rows, 0),
  canonical_kpi_name: canonical,
  variants,
});

describe('split KPI name variants', () => {
  it('excludes the canonical name from the rename set', () => {
    const g = group(
      [
        { kpi_name: 'Consumable cost.:', rows: 1, open_rows: 1 },
        { kpi_name: 'Consumable cost.: - Description: per KW/Hour', rows: 1, open_rows: 1 },
        { kpi_name: 'Consumable cost.: - Description: per MW', rows: 1, open_rows: 1 },
      ],
      'Consumable cost.:',
    );
    expect(nonCanonicalVariants(g).map((v) => v.kpi_name)).toEqual([
      'Consumable cost.: - Description: per KW/Hour',
      'Consumable cost.: - Description: per MW',
    ]);
  });

  it('ignores variants with no open rows (locked history stays as-is)', () => {
    const g = group(
      [
        { kpi_name: 'A', rows: 4, open_rows: 0 },
        { kpi_name: 'A long legacy blob', rows: 2, open_rows: 0 },
      ],
      'A',
    );
    expect(nonCanonicalVariants(g)).toHaveLength(0);
  });

  it('returns nothing when the group is already normalised', () => {
    const g = group([{ kpi_name: 'A', rows: 3, open_rows: 3 }], 'A');
    expect(nonCanonicalVariants(g)).toHaveLength(0);
  });
});

/**
 * ADR-354 — the same title split across two categories cannot be fixed by a
 * rename; the dominant (largest) category is the one to keep.
 */
import { dominantCategory, type CrossCategorySplitGroup } from '@/hooks/useSplitKpiNameVariants';

describe('cross-category KPI title splits', () => {
  const g: CrossCategorySplitGroup = {
    kra_name: "Achieve organization's production target",
    kpi_title: 'Power generation from 8 MWh',
    category_count: 2,
    open_rows: 19,
    total_rows: 19,
    categories: [
      { category_id: 'prod-ops', category_name: 'Production & Operations', rows: 17, open_rows: 17, name_variants: 2 },
      { category_id: 'prod', category_name: 'Production', rows: 2, open_rows: 2, name_variants: 1 },
    ],
  };

  it('picks the category holding the most rows', () => {
    expect(dominantCategory(g)?.category_id).toBe('prod-ops');
  });

  it('returns null when there are no categories', () => {
    expect(dominantCategory({ ...g, categories: [] })).toBeNull();
  });
});
