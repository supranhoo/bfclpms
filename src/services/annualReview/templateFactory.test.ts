import { describe, it, expect } from 'vitest';
import { resolveWeight, parseScoringRules, type SystemKpiWeightRow } from './systemKpiLibrary';
import { bucketFromGradeCode, ayBounds } from './archetypeResolver';

const w = (o: Partial<SystemKpiWeightRow>): SystemKpiWeightRow => ({
  id: 'x', system_kpi_id: 'k1', department_id: null, sub_unit_id: null,
  grade_bucket: null, weight_pct: 10, created_at: null, updated_at: null,
  ...o,
} as SystemKpiWeightRow);

describe('resolveWeight — specificity cascade (Sub-unit > Dept > Grade)', () => {
  it('picks sub-unit match over dept and wildcard', () => {
    const rows = [
      w({ id: 'a', weight_pct: 5 }),                                     // wildcard
      w({ id: 'b', department_id: 'D1', weight_pct: 10 }),               // dept
      w({ id: 'c', department_id: 'D1', sub_unit_id: 'S1', weight_pct: 15 }), // sub-unit
    ];
    expect(resolveWeight(rows, 'k1', 'D1', 'S1', 'M')?.id).toBe('c');
  });
  it('falls back to dept when sub-unit does not match', () => {
    const rows = [w({ id: 'a', weight_pct: 5 }), w({ id: 'b', department_id: 'D1', weight_pct: 10 })];
    expect(resolveWeight(rows, 'k1', 'D1', 'S9', 'M')?.id).toBe('b');
  });
  it('ignores rows for other KPIs', () => {
    const rows = [w({ id: 'a', system_kpi_id: 'other', department_id: 'D1', weight_pct: 99 })];
    expect(resolveWeight(rows, 'k1', 'D1', null, null)).toBeNull();
  });
  it('grade wildcard beats no match', () => {
    const rows = [w({ id: 'a', grade_bucket: 'W', weight_pct: 7 })];
    expect(resolveWeight(rows, 'k1', null, null, 'W')?.id).toBe('a');
    expect(resolveWeight(rows, 'k1', null, null, 'M')).toBeNull();
  });
});

describe('parseScoringRules', () => {
  it('defaults to empty higher_better when input is malformed', () => {
    expect(parseScoringRules(null)).toEqual({ direction: 'higher_better', bands: [] });
    expect(parseScoringRules('junk' as never)).toEqual({ direction: 'higher_better', bands: [] });
  });
  it('sorts bands high-to-low and drops non-numeric entries', () => {
    const r = parseScoringRules({
      direction: 'lower_better',
      bands: [
        { score: 5, threshold: 100 },
        { score: 10, threshold: 50 },
        { score: 'bad', threshold: 1 },
      ],
    } as never);
    expect(r.direction).toBe('lower_better');
    expect(r.bands.map((b) => b.score)).toEqual([10, 5]);
  });
});

describe('archetype resolver helpers', () => {
  it('bucketFromGradeCode maps M/W/T prefixes, else other', () => {
    expect(bucketFromGradeCode('M1')).toBe('M');
    expect(bucketFromGradeCode('w-05')).toBe('W');
    expect(bucketFromGradeCode('T3')).toBe('T');
    expect(bucketFromGradeCode('X')).toBe('other');
    expect(bucketFromGradeCode(null)).toBe('other');
    expect(bucketFromGradeCode('')).toBe('other');
  });
  it('ayBounds returns July→June window', () => {
    expect(ayBounds(2025)).toEqual({ fromISO: '2025-07-01', toISO: '2026-06-30' });
  });
});