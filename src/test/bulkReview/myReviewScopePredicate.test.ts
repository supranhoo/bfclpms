import { describe, it, expect } from 'vitest';
import { isRowInMyReviewScope } from '@/lib/bulkAuditScopeFilter';

const row = (kpi: string, emp: string) => ({ kpi_id: kpi, employee_id: emp, category_id: null });

describe('Bulk Review — workflow-driven "My scope only" predicate', () => {
  const pairs = new Set(['k1|e1', 'k2|e1', 'k3|e2']);

  it('matches exact (kpi, employee) pairs only', () => {
    expect(isRowInMyReviewScope(row('k1', 'e1'), pairs)).toBe(true);
    expect(isRowInMyReviewScope(row('k3', 'e2'), pairs)).toBe(true);
  });

  // Regression: legacy `isRowInAuditorScope` returned true for any KPI of
  // an employee in `employeeIds`. The new predicate must NOT do that —
  // KPIs the user has no workflow role on must be excluded even if the
  // employee is otherwise audited.
  it('does NOT bleed: employee in audit scope but KPI is not in workflow → false', () => {
    expect(isRowInMyReviewScope(row('k_random', 'e1'), pairs)).toBe(false);
  });

  it('rejects rows outside the scope entirely', () => {
    expect(isRowInMyReviewScope(row('k_other', 'e_other'), pairs)).toBe(false);
  });

  it('handles empty scope', () => {
    expect(isRowInMyReviewScope(row('k1', 'e1'), new Set())).toBe(false);
  });
});