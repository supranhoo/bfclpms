/**
 * ADR-263 — Goal object contract tests.
 *
 * Locks the client guarantees of the goal layer: progress is derived from
 * start→target (not 0→target), roll-up across sub-periods honours the goal's
 * declared summary rule, and within a period aggregation is weightage-weighted
 * rather than a straight average.
 */
import { describe, it, expect } from 'vitest';
import {
  goalProgressPercent,
  GOAL_SUMMARY_RULE_LABELS,
  GOAL_TRACKING_LABELS,
  type GoalSummaryRule,
} from '@/hooks/useBuConsole';

/** Mirrors the SQL roll-up in `bu_goal_rollup` for verification purposes. */
function weightedPeriodValue(rows: Array<{ achieved: number | null; weightage: number | null; is_na?: boolean }>) {
  const usable = rows.filter(r => !r.is_na && r.achieved !== null);
  if (usable.length === 0) return null;
  const wsum = usable.reduce((s, r) => s + (r.weightage || 1), 0);
  const num = usable.reduce((s, r) => s + (r.achieved as number) * (r.weightage || 1), 0);
  return wsum === 0 ? null : Math.round((num / wsum) * 100) / 100;
}

function summarise(periods: number[], rule: GoalSummaryRule) {
  if (periods.length === 0) return null;
  if (rule === 'sum') return periods.reduce((a, b) => a + b, 0);
  if (rule === 'avg') return periods.reduce((a, b) => a + b, 0) / periods.length;
  return periods[periods.length - 1];
}

const mockPeriodRows = [
  { achieved: 100, weightage: 30 },
  { achieved: 50, weightage: 10 },
  { achieved: 80, weightage: null },
  { achieved: 10, weightage: 20, is_na: true }, // N/A never counts
  { achieved: null, weightage: 20 },            // unscored never counts
];

describe('BU Console goal objects', () => {
  it('weights a period by employee weightage, never a plain average', () => {
    const weighted = weightedPeriodValue(mockPeriodRows)!;
    const plainAvg = (100 + 50 + 80) / 3;
    expect(weighted).toBeCloseTo((100 * 30 + 50 * 10 + 80 * 1) / 41, 2);
    expect(weighted).not.toBeCloseTo(plainAvg, 2);
  });

  it('excludes N/A and unscored rows from the roll-up', () => {
    const withoutExcluded = weightedPeriodValue(mockPeriodRows.slice(0, 3));
    expect(weightedPeriodValue(mockPeriodRows)).toBe(withoutExcluded);
  });

  it('returns null when a period has nothing scorable', () => {
    expect(weightedPeriodValue([{ achieved: null, weightage: 10 }])).toBeNull();
  });

  it('summarises sub-periods by the declared rule', () => {
    const periods = [10, 20, 30];
    expect(summarise(periods, 'last')).toBe(30);
    expect(summarise(periods, 'sum')).toBe(60);
    expect(summarise(periods, 'avg')).toBe(20);
  });

  it('measures progress from start to target, not from zero', () => {
    expect(goalProgressPercent({ start_value: 100, target_value: 200, current_value: 150 })).toBe(50);
    expect(goalProgressPercent({ start_value: null, target_value: 200, current_value: 50 })).toBe(25);
  });

  it('clamps progress and handles a degenerate start = target goal', () => {
    expect(goalProgressPercent({ start_value: 0, target_value: 100, current_value: 250 })).toBe(100);
    expect(goalProgressPercent({ start_value: 0, target_value: 100, current_value: -50 })).toBe(0);
    expect(goalProgressPercent({ start_value: 50, target_value: 50, current_value: 50 })).toBe(100);
    expect(goalProgressPercent({ start_value: 50, target_value: 50, current_value: 10 })).toBe(0);
  });

  it('reports "not measurable" instead of a fake zero when data is missing', () => {
    expect(goalProgressPercent({ start_value: 0, target_value: null, current_value: 10 })).toBeNull();
    expect(goalProgressPercent({ start_value: 0, target_value: 100, current_value: null })).toBeNull();
  });

  it('labels every tracking method and summary rule shown to admins', () => {
    expect(Object.keys(GOAL_TRACKING_LABELS).sort()).toEqual(['manual', 'rollup', 'source']);
    expect(Object.keys(GOAL_SUMMARY_RULE_LABELS).sort()).toEqual(['avg', 'last', 'sum']);
  });
});
