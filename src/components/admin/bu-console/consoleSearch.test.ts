import { describe, expect, it } from 'vitest';
import { filterConsoleTree, normalizeSearch, textMatches } from './consoleSearch';
import type { BuConsoleCategoryNode, BuConsoleKpiNode } from '@/hooks/useBuConsole';

const kpi = (title: string, extra: Partial<BuConsoleKpiNode> = {}): BuConsoleKpiNode => ({
  kpi_key: `k-${title}`,
  title_key: title.toLowerCase(),
  kpi_name: title,
  kpi_title: title,
  kpi_description: null,
  kpi_rows: 1,
  employee_count: 1,
  variant_count: 1,
  weightage_values: null,
  avg_score: null,
  is_structured: true,
  is_org_level: false,
  variants: [],
  ...extra,
});

const tree = (): BuConsoleCategoryNode[] => [
  {
    category_id: 'c1',
    category_name: 'Production',
    kra_count: 2,
    kpi_count: 3,
    kras: [
      { kra_key: 'kra-1', kra_name: 'Output', kpi_count: 2, kpis: [kpi('Tonnage'), kpi('Yield')] },
      { kra_key: 'kra-2', kra_name: 'Safety', kpi_count: 1, kpis: [kpi('Near miss')] },
    ],
  },
  {
    category_id: 'c2',
    category_name: 'Quality',
    kra_count: 1,
    kpi_count: 1,
    kras: [{ kra_key: 'kra-3', kra_name: 'Rejections', kpi_count: 1, kpis: [kpi('Rework %')] }],
  },
];

describe('consoleSearch', () => {
  it('normalises and matches case-insensitively', () => {
    expect(normalizeSearch('  Tonnage ')).toBe('tonnage');
    expect(textMatches('Near Miss', 'near')).toBe(true);
    expect(textMatches(null, 'near')).toBe(false);
    expect(textMatches(null, '')).toBe(true);
  });

  it('passes the tree through when the query is empty', () => {
    const r = filterConsoleTree(tree(), '   ');
    expect(r.active).toBe(false);
    expect(r.categories).toHaveLength(2);
    expect(r.matchedKpis).toBe(4);
  });

  it('keeps only matching KPIs and recomputes counts', () => {
    const r = filterConsoleTree(tree(), 'yield');
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0].kras).toHaveLength(1);
    expect(r.categories[0].kras[0].kpis.map(k => k.kpi_title)).toEqual(['Yield']);
    expect(r.categories[0].kpi_count).toBe(1);
    expect(r.matchedKpis).toBe(1);
    expect(r.firstCategoryId).toBe('c1');
    expect(r.firstKraKey).toBe('kra-1');
  });

  it('keeps every KPI under a matching KRA name', () => {
    const r = filterConsoleTree(tree(), 'output');
    expect(r.categories[0].kras[0].kpis).toHaveLength(2);
  });

  it('keeps the whole category when the category name matches', () => {
    const r = filterConsoleTree(tree(), 'quality');
    expect(r.categories).toHaveLength(1);
    expect(r.categories[0].category_id).toBe('c2');
    expect(r.categories[0].kras[0].kpis).toHaveLength(1);
  });

  it('matches KPI description and variant names', () => {
    const cats = tree();
    cats[1].kras[0].kpis = [
      kpi('Rework %', {
        kpi_description: 'Scrap ratio at line end',
        variants: [
          {
            variant_key: 'v1',
            kpi_name: 'Rework percentage (line)',
            kpi_names: ['Rework percentage (line)'],
            description: null,
            formula: null,
            scoring_logic: null,
            target_value: null,
            uom: null,
            kpi_rows: 1,
            employee_count: 1,
            avg_score: null,
          },
        ],
      }),
    ];
    expect(filterConsoleTree(cats, 'scrap').matchedKpis).toBe(1);
    expect(filterConsoleTree(cats, 'percentage').matchedKpis).toBe(1);
  });

  it('returns an empty tree when nothing matches', () => {
    const r = filterConsoleTree(tree(), 'zzz');
    expect(r.categories).toEqual([]);
    expect(r.matchedKpis).toBe(0);
    expect(r.firstCategoryId).toBeNull();
  });
});
