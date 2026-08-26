/**
 * ADR-322 — on a KPI row only the grouped org dimensions carry a target id.
 * Department and Employee scopes resolve from the row's own employee, so their
 * columns must never be offered (or written) by the group editor.
 */
import { describe, it, expect } from 'vitest';
import {
  KPI_ROW_SCOPE_TARGET_COLUMNS, KPI_ROW_TARGET_COLUMNS, rowScopeNeedsTarget,
} from './kpiScope';

describe('row-level scope targets', () => {
  it('maps each grouped scope to its own column', () => {
    expect(KPI_ROW_SCOPE_TARGET_COLUMNS.business_unit).toBe('business_unit_id');
    expect(KPI_ROW_SCOPE_TARGET_COLUMNS.location).toBe('location_id');
    expect(KPI_ROW_SCOPE_TARGET_COLUMNS.division).toBe('division_id');
    expect(KPI_ROW_SCOPE_TARGET_COLUMNS.pms_grade).toBe('pms_grade_id');
    expect(KPI_ROW_SCOPE_TARGET_COLUMNS.level).toBe('level_id');
  });

  it('never asks for a target for individual, organization, department or employee', () => {
    for (const s of ['individual', 'organization', 'department', 'employee'] as const) {
      expect(KPI_ROW_SCOPE_TARGET_COLUMNS[s]).toBeNull();
      expect(rowScopeNeedsTarget(s)).toBe(false);
    }
  });

  it('lists exactly the five writable target columns', () => {
    expect([...KPI_ROW_TARGET_COLUMNS].sort()).toEqual(
      ['business_unit_id', 'division_id', 'level_id', 'location_id', 'pms_grade_id'],
    );
    expect(KPI_ROW_TARGET_COLUMNS).not.toContain('employee_id' as never);
  });

  it('treats unknown or empty scope words as needing no target', () => {
    expect(rowScopeNeedsTarget('')).toBe(false);
    expect(rowScopeNeedsTarget(undefined)).toBe(false);
    expect(rowScopeNeedsTarget('nonsense')).toBe(false);
  });
});
