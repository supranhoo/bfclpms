import { describe, it, expect } from 'vitest';
import { matchesSelectedStatuses } from '@/pages/reports/EmployeePerformanceSummary';

describe('EmployeePerformanceSummary status multi-select filter', () => {
  const statusCounts = {
    approved: 1,
    manager_check: 2,
    self_review: 0,
  };

  it('includes all rows when no status is selected', () => {
    expect(matchesSelectedStatuses([], statusCounts)).toBe(true);
  });

  it('keeps rows that contain the selected status', () => {
    expect(matchesSelectedStatuses(['approved'], statusCounts)).toBe(true);
    expect(matchesSelectedStatuses(['manager_check'], statusCounts)).toBe(true);
  });

  it('keeps rows matching any of multiple selected statuses', () => {
    expect(matchesSelectedStatuses(['approved', 'audit'], statusCounts)).toBe(true);
    expect(matchesSelectedStatuses(['manager_check', 'audit'], statusCounts)).toBe(true);
  });

  it('excludes rows that have none of the selected statuses', () => {
    expect(matchesSelectedStatuses(['audit'], statusCounts)).toBe(false);
    expect(matchesSelectedStatuses(['audit', 'hr_pms_review'], statusCounts)).toBe(false);
  });

  it('treats zero-count statuses as not matching', () => {
    expect(matchesSelectedStatuses(['self_review'], statusCounts)).toBe(false);
  });

  it('handles unknown status keys gracefully', () => {
    expect(matchesSelectedStatuses(['unknown_status'], statusCounts)).toBe(false);
    expect(matchesSelectedStatuses(['approved', 'unknown_status'], statusCounts)).toBe(true);
  });
});
