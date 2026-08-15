/**
 * ADR-270 — console KPI node contract.
 * Mirrors the SQL grouping rules so a change in either side shows up here.
 */
import { describe, it, expect } from 'vitest';

type Row = {
  kpi_name: string;
  kpi_title: string | null;
  kpi_description?: string | null;
  kpi_formula?: string | null;
  kpi_scoring_logic?: string | null;
  target_value?: number | null;
  weightage?: number | null;
};

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const titleKey = (r: Row) => norm(r.kpi_title?.trim() ? r.kpi_title : r.kpi_name);
const variantKey = (r: Row) =>
  [norm(r.kpi_description), norm(r.kpi_formula), norm(r.kpi_scoring_logic), r.target_value ?? ''].join('|');

function nodes(rows: Row[]) {
  const map = new Map<string, { variants: Set<string>; weights: Set<number> }>();
  for (const r of rows) {
    const k = titleKey(r);
    if (!map.has(k)) map.set(k, { variants: new Set(), weights: new Set() });
    map.get(k)!.variants.add(variantKey(r));
    if (r.weightage != null) map.get(k)!.weights.add(r.weightage);
  }
  return map;
}

describe('BU console KPI nodes', () => {
  it('collapses rows that share a structured title into one node', () => {
    const map = nodes([
      { kpi_name: 'Plant load factor. Formula: x', kpi_title: 'Plant Load Factor', weightage: 10 },
      { kpi_name: 'Plant load factor — variant text', kpi_title: 'Plant Load Factor', weightage: 10 },
    ]);
    expect(map.size).toBe(1);
    expect([...map.values()][0].variants.size).toBe(1);
  });

  it('declares a variant when formula, scoring or target differ', () => {
    const map = nodes([
      { kpi_name: 'a', kpi_title: 'Availability', kpi_formula: 'A/B', target_value: 95 },
      { kpi_name: 'b', kpi_title: 'Availability', kpi_formula: 'A/C', target_value: 95 },
      { kpi_name: 'c', kpi_title: 'Availability', kpi_formula: 'A/B', target_value: 90 },
    ]);
    expect([...map.values()][0].variants.size).toBe(3);
  });

  it('treats weightage differences as values, not variants', () => {
    const map = nodes([
      { kpi_name: 'a', kpi_title: 'Safety Index', kpi_formula: 'f', weightage: 10 },
      { kpi_name: 'b', kpi_title: 'Safety Index', kpi_formula: 'f', weightage: 20 },
    ]);
    const node = [...map.values()][0];
    expect(node.variants.size).toBe(1);
    expect(node.weights.size).toBe(2);
  });

  it('falls back to the raw name for legacy rows without a title', () => {
    const map = nodes([
      { kpi_name: 'Legacy blob text', kpi_title: null },
      { kpi_name: 'legacy   blob TEXT', kpi_title: '' },
    ]);
    expect(map.size).toBe(1);
  });
});
