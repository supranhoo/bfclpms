/** ADR-208 — low-scoring KPI picker helpers. */
import { describe, it, expect } from 'vitest';
import {
  filterLowScoringKpis,
  groupByKra,
  kpiAreaLabel,
  monthLabel,
  type RawKpiScoreRow,
} from '@/lib/pip/lowScoringKpis';

const row = (over: Partial<RawKpiScoreRow>): RawKpiScoreRow => ({
  id: 'k1',
  kra_name: 'Production',
  kpi_name: 'Yield',
  review_period: 'March',
  review_year: 2026,
  final_score: 1.5,
  is_na: false,
  ...over,
});

describe('filterLowScoringKpis', () => {
  it('keeps only scores strictly below the threshold', () => {
    const out = filterLowScoringKpis(
      [
        row({ id: 'a', final_score: 1.2 }),
        row({ id: 'b', final_score: 2 }),
        row({ id: 'c', final_score: 4.5 }),
      ],
      2,
    );
    expect(out.map(r => r.kpiId)).toEqual(['a']);
  });

  it('excludes N/A and unscored rows', () => {
    const out = filterLowScoringKpis(
      [
        row({ id: 'na', is_na: true, final_score: 0 }),
        row({ id: 'null', final_score: null }),
        row({ id: 'ok', final_score: 0.5 }),
      ],
      2,
    );
    expect(out.map(r => r.kpiId)).toEqual(['ok']);
  });

  it('drops rows without a resolvable period', () => {
    const out = filterLowScoringKpis(
      [row({ id: 'x', review_period: null }), row({ id: 'y', review_year: null })],
      2,
    );
    expect(out).toHaveLength(0);
  });

  it('coerces numeric strings from the API', () => {
    const out = filterLowScoringKpis([row({ final_score: '1.25' })], 2);
    expect(out[0].score).toBeCloseTo(1.25);
  });

  it('sorts worst score first', () => {
    const out = filterLowScoringKpis(
      [row({ id: 'a', final_score: 1.9 }), row({ id: 'b', final_score: 0.2 })],
      2,
    );
    expect(out.map(r => r.kpiId)).toEqual(['b', 'a']);
  });

  it('falls back to readable names', () => {
    const out = filterLowScoringKpis([row({ kra_name: null, kpi_name: null })], 2);
    expect(out[0].kraName).toBe('Uncategorised KRA');
    expect(out[0].kpiName).toBe('Untitled KPI');
  });
});

describe('groupByKra', () => {
  it('groups and orders groups by their worst score', () => {
    const rows = filterLowScoringKpis(
      [
        row({ id: 'a', kra_name: 'Safety', final_score: 1.8 }),
        row({ id: 'b', kra_name: 'Production', final_score: 0.4 }),
        row({ id: 'c', kra_name: 'Production', final_score: 1.1 }),
      ],
      2,
    );
    const groups = groupByKra(rows);
    expect(groups.map(g => g.kraName)).toEqual(['Production', 'Safety']);
    expect(groups[0].rows.map(r => r.kpiId)).toEqual(['b', 'c']);
  });
});

describe('labels', () => {
  it('formats a stable, human-readable improvement area', () => {
    const [r] = filterLowScoringKpis([row({})], 2);
    expect(monthLabel(r.month, r.year)).toBe('Mar 2026');
    expect(kpiAreaLabel(r)).toBe('Production — Yield (Mar 2026)');
  });

  it('never leaks formula or scoring-logic text', () => {
    const [r] = filterLowScoringKpis([row({})], 2);
    expect(Object.keys(r)).toEqual(
      expect.not.arrayContaining(['criteria', 'r5', 'r0', 'target_value']),
    );
  });
});
