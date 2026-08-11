/**
 * ADR-252b — the continuity window now gates TNI as well as PIP:
 * a KPI must be at or below the threshold in every scored month AND have at
 * least `minScoredMonths` scored months inside the selected range.
 */
import { describe, it, expect } from 'vitest';
import { evaluateContinuity } from '@/lib/continuity/allMonthsAtOrBelow';

const order = ['2026|April', '2026|May', '2026|June'];

describe('TNI minimum scored months', () => {
  it('does not qualify a KPI scored below threshold in only one of three months', () => {
    const r = evaluateContinuity({ '2026|May': 2 }, order, 3, { minScoredMonths: 3 });
    expect(r.scoredMonths).toBe(1);
    expect(r.shortWindow).toBe(true);
    expect(r.qualifies).toBe(false);
  });

  it('qualifies when all three months are scored at or below the threshold', () => {
    const r = evaluateContinuity(
      { '2026|April': 2.5, '2026|May': 3, '2026|June': 1.75 },
      order,
      3,
      { minScoredMonths: 3 },
    );
    expect(r.qualifies).toBe(true);
    expect(r.worstScore).toBe(1.75);
  });

  it('disqualifies when a month scored at a non-final stage is above the threshold', () => {
    // 4.5 comes from the manager stage via the score cascade — it must count.
    const r = evaluateContinuity(
      { '2026|April': 2, '2026|May': 4.5, '2026|June': 2 },
      order,
      3,
      { minScoredMonths: 3 },
    );
    expect(r.qualifies).toBe(false);
  });

  it('still qualifies a single-month selection when the window is clamped to the range', () => {
    const r = evaluateContinuity({ '2026|June': 2 }, ['2026|June'], 3, { minScoredMonths: 1 });
    expect(r.qualifies).toBe(true);
  });
});