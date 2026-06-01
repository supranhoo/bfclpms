import { describe, it, expect } from 'vitest';

/**
 * Regression test for the KRA-rollover duplicate-key bug.
 *
 * The edge function previously built `possibleTargetMonths` using ONLY
 * standard (Jan-anchored) cycle starts. When a source KPI carried a custom
 * `frequency_cycle_start` (e.g. Quarterly anchored Feb-Apr), the actual
 * resolved cycle months fell outside the queried set, so pre-existing
 * target rows were not detected → insert hit `idx_kpis_no_duplicates`.
 *
 * These tests cover the helper logic in isolation. We re-declare the same
 * pure helpers used by the edge function (kept in sync intentionally —
 * the Deno runtime cannot be imported from vitest).
 */

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const MONTH_ABBREV = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function parseCycleStartIdx(cs: string | null | undefined): number | null {
  if (!cs) return null;
  const map: Record<string, number> = Object.fromEntries(MONTH_ABBREV.map((m, i) => [m, i]));
  const first = cs.split('-')[0];
  return map[first] ?? null;
}
function getCycleLength(freq: string): number {
  switch (freq.trim()) {
    case 'Bi-Monthly': return 2;
    case 'Quarterly': return 3;
    case 'Half-Yearly': return 6;
    case 'Yearly': return 12;
    default: return 1;
  }
}
function getCycleMonthsForTarget(targetIdx: number, freq: string | null, cs?: string | null): number[] {
  if (!freq) return [targetIdx];
  const len = getCycleLength(freq);
  if (len <= 1) return [targetIdx];
  const csIdx = parseCycleStartIdx(cs);
  if (csIdx !== null) {
    const offset = ((targetIdx - csIdx) % 12 + 12) % 12;
    const cycleIdx = Math.floor(offset / len);
    const start = (csIdx + cycleIdx * len) % 12;
    return Array.from({ length: len }, (_, i) => (start + i) % 12);
  }
  const f = freq.trim();
  if (f === 'Bi-Monthly') {
    const p = targetIdx % 2 === 0 ? targetIdx : targetIdx - 1;
    return [p, p + 1];
  }
  if (f === 'Quarterly') {
    if (targetIdx <= 2) return [0,1,2];
    if (targetIdx <= 5) return [3,4,5];
    if (targetIdx <= 8) return [6,7,8];
    return [9,10,11];
  }
  if (f === 'Half-Yearly') return targetIdx <= 5 ? [0,1,2,3,4,5] : [6,7,8,9,10,11];
  if (f === 'Yearly') return [0,1,2,3,4,5,6,7,8,9,10,11];
  return [targetIdx];
}

function buildPossibleTargetMonths(sourceKpis: Array<{ frequency: string | null; frequency_cycle_start?: string | null }>, targetMonth: string): Set<string> {
  const targetIdx = MONTHS.indexOf(targetMonth);
  const out = new Set<string>([targetMonth]);
  for (const k of sourceKpis) {
    const months = getCycleMonthsForTarget(targetIdx, k.frequency, k.frequency_cycle_start);
    for (const m of months) if (m >= targetIdx) out.add(MONTHS[m]);
  }
  return out;
}

describe('rollover possibleTargetMonths', () => {
  it('includes target month when source is Monthly', () => {
    const set = buildPossibleTargetMonths([{ frequency: 'Monthly' }], 'June');
    expect([...set].sort()).toEqual(['June']);
  });

  it('covers non-standard Quarterly anchor (Feb-Apr) for June target', () => {
    // csIdx=1, len=3, target=5 → offset=4, cycleIdx=1, start=4 → months [4,5,6] (May,Jun,Jul)
    const set = buildPossibleTargetMonths(
      [{ frequency: 'Quarterly', frequency_cycle_start: 'Feb-Apr' }],
      'June',
    );
    // Filter >= June (idx 5): June, July
    expect(set.has('June')).toBe(true);
    expect(set.has('July')).toBe(true);
  });

  it('covers Yearly source by including remaining months of the year', () => {
    const set = buildPossibleTargetMonths([{ frequency: 'Yearly' }], 'June');
    ['June','July','August','September','October','November','December'].forEach(m =>
      expect(set.has(m)).toBe(true)
    );
  });

  it('unions months across multiple source KPIs', () => {
    const set = buildPossibleTargetMonths(
      [
        { frequency: 'Monthly' },
        { frequency: 'Bi-Monthly' },
        { frequency: 'Quarterly', frequency_cycle_start: 'Feb-Apr' },
      ],
      'June',
    );
    expect(set.has('June')).toBe(true);
    expect(set.has('July')).toBe(true);
  });
});
