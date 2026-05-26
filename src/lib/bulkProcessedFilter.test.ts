import { describe, expect, it } from 'vitest';
import { isKpiRowFullyProcessed } from './bulkProcessedFilter';
import type { BulkReviewRow } from '@/hooks/useBulkReview';

function row(partial: Partial<BulkReviewRow>): BulkReviewRow {
  return {
    submission_id: 's', kpi_id: 'k', employee_id: 'e', employee_name: 'x',
    employee_code: null, kra_name: 'KRA', kpi_name: 'KPI', weightage: 5,
    self_score: null, manager_score: null, skip_level_score: null,
    hr_pms_score: null, auditor_score: null, management_score: null,
    final_score: null, is_na: null,
    ...partial,
  } as unknown as BulkReviewRow;
}

const KEY = 'KRA|KPI';
const cell = (
  entries: Array<[string, Partial<BulkReviewRow>]>,
) => {
  const m = new Map<string, BulkReviewRow>();
  for (const [emp, p] of entries) m.set(`${KEY}::${emp}`, row(p));
  return m;
};

describe('isKpiRowFullyProcessed', () => {
  it('hides when every employee has a stage score', () => {
    const m = cell([['a', { manager_score: 4 }], ['b', { manager_score: 5 }]]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'manager_score')).toBe(true);
  });

  it('keeps visible when one employee is pending', () => {
    const m = cell([['a', { manager_score: 4 }], ['b', { manager_score: null }]]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'manager_score')).toBe(false);
  });

  it('ignores employees with no cell (unassigned) and hides when all assignees are done', () => {
    const m = cell([['a', { manager_score: 4 }]]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'manager_score')).toBe(true);
  });

  it('keeps visible when an assignee is pending even if others are unassigned', () => {
    const m = cell([['a', { manager_score: null }]]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'manager_score')).toBe(false);
  });

  it('keeps visible when no employee in the list has a cell (no assignees)', () => {
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], new Map(), 'manager_score')).toBe(false);
  });

  it('treats N/A cells as processed', () => {
    const m = cell([['a', { is_na: true }], ['b', { manager_score: 3 }]]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'manager_score')).toBe(true);
  });

  it('defensively keeps visible when employee list is empty', () => {
    expect(isKpiRowFullyProcessed(KEY, [], new Map(), 'manager_score')).toBe(false);
  });
});