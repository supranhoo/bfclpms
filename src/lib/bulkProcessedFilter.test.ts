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

  // Jitendra RCA Jun 2026: Auditor view + KPI whose workflow has no audit stage.
  it('treats terminal cells (final_score set) as processed even when stageKey column is null', () => {
    const m = cell([
      ['a', { auditor_score: null, final_score: 4.5, status: 'approved' }],
      ['b', { auditor_score: null, final_score: 3.0, status: 'approved' }],
    ]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'auditor_score')).toBe(true);
  });

  it('treats cells whose status is past the viewer stage as processed (audit-less workflow)', () => {
    // status='management_review' is past 'audit' in the canonical chain
    const m = cell([
      ['a', { auditor_score: null, status: 'management_review' }],
      ['b', { auditor_score: null, status: 'management_review' }],
    ]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'auditor_score')).toBe(true);
  });

  it('keeps visible when status is before the viewer stage (genuinely pending)', () => {
    // viewer=auditor (=='audit'). status='manager_check' is before audit.
    const m = cell([
      ['a', { auditor_score: null, status: 'manager_check' }],
      ['b', { auditor_score: null, status: 'manager_check' }],
    ]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'auditor_score')).toBe(false);
  });

  it('keeps visible when one cell is past the stage but another is still pending', () => {
    const m = cell([
      ['a', { auditor_score: null, status: 'approved', final_score: 4 }],
      ['b', { auditor_score: null, status: 'hr_pms_review' }],
    ]);
    expect(isKpiRowFullyProcessed(KEY, ['a', 'b'], m, 'auditor_score')).toBe(false);
  });
});