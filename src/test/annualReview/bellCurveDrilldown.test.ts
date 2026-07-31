import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BELL_CURVE_CONFIG,
  employeesInBand,
  heatmapBands,
  makeBanding,
  type BellCurveInput,
} from '@/lib/annualReview/bellCurve';

const cfg = DEFAULT_BELL_CURVE_CONFIG;

const emp = (id: string, score: number | null, dept = 'd1', extra: Partial<BellCurveInput> = {}): BellCurveInput => ({
  instance_id: id,
  employee_code: id,
  employee_name: `Emp ${id}`,
  department_id: dept,
  department_name: dept.toUpperCase(),
  total_score: score,
  ...extra,
});

const rows: BellCurveInput[] = [
  emp('1', 70),   // 3.50 → slab 12%, rating band 4
  emp('2', 64),   // 3.20 → slab 8%,  rating band 3
  emp('3', 95),   // 4.75 → slab 20%, rating band 5
  emp('4', null), // unrated
  emp('5', 80, 'd1', { is_excluded: true }),
  emp('6', 66, 'd2'), // other department
];

describe('employeesInBand (ADR-218c)', () => {
  it('matches the heat map cell count in slab mode', () => {
    const banding = makeBanding('slab', cfg);
    const heat = heatmapBands(rows, 'department', banding, cfg);
    const d1 = heat.find((h) => h.id === 'd1')!;
    for (const cell of d1.cells) {
      expect(employeesInBand(rows, 'department', 'd1', banding, cell.key)).toHaveLength(cell.count);
    }
  });

  it('matches the heat map cell count in rating mode', () => {
    const banding = makeBanding('rating', cfg);
    const heat = heatmapBands(rows, 'department', banding, cfg);
    const d1 = heat.find((h) => h.id === 'd1')!;
    for (const cell of d1.cells) {
      expect(employeesInBand(rows, 'department', 'd1', banding, cell.key)).toHaveLength(cell.count);
    }
  });

  it('places an exact 3.50 boundary rating in the higher slab (12%)', () => {
    const banding = makeBanding('slab', cfg);
    const list = employeesInBand(rows, 'department', 'd1', banding, 'slab:3.5');
    expect(list.map((e) => e.instance_id)).toEqual(['1']);
  });

  it('omits unrated and excluded employees', () => {
    const banding = makeBanding('slab', cfg);
    const all = banding.defs.flatMap((d) => employeesInBand(rows, 'department', 'd1', banding, d.key));
    expect(all.map((e) => e.instance_id).sort()).toEqual(['1', '2', '3']);
  });

  it('scopes to the requested group and returns empty for unknown ids', () => {
    const banding = makeBanding('rating', cfg);
    expect(employeesInBand(rows, 'department', 'nope', banding, '3')).toEqual([]);
    expect(employeesInBand(rows, 'department', 'd2', banding, '3').map((e) => e.instance_id)).toEqual(['6']);
  });

  it('sorts by rating, highest first', () => {
    const banding = makeBanding('rating', cfg);
    const all = banding.defs.flatMap((d) => employeesInBand(rows, 'department', 'd1', banding, d.key));
    const inBand = employeesInBand([emp('a', 80), emp('b', 84)], 'department', 'd1', banding, '4');
    expect(all.length).toBe(3);
    expect(inBand.map((e) => e.instance_id)).toEqual(['b', 'a']);
  });
});