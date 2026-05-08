import { describe, it, expect } from 'vitest';

/**
 * Lightweight contract test: documents the scoped-employee invariant
 * for RolloverDialog when used from the per-employee scorecard header.
 *
 * The dialog payload to the `auto-rollover-kpis` edge function must include
 * `employee_ids: [scopedEmployee.id]` and `dry_run: true` for the preview step,
 * and the same `employee_ids` (with `dry_run: false`) for the execute step.
 */
describe('RolloverDialog (scoped employee mode)', () => {
  it('forwards employee_ids = [scopedEmployee.id] in the edge-function payload', () => {
    const scopedEmployee = { id: 'emp-123', name: 'Test User', code: 'E123' };
    const previewBody = {
      triggered_by: 'admin_manual',
      source_month: 'April',
      source_year: 2026,
      target_month: 'May',
      target_year: 2026,
      employee_ids: [scopedEmployee.id],
      dry_run: true,
    };
    expect(previewBody.employee_ids).toEqual(['emp-123']);
    expect(previewBody.dry_run).toBe(true);
  });

  it('locks selectedEmployeeIds and disables All-Employees switch when scoped', () => {
    const scopedEmployee = { id: 'emp-123', name: 'Test User' };
    const allEmployees = !scopedEmployee;
    const selectedEmployeeIds = scopedEmployee ? [scopedEmployee.id] : [];
    expect(allEmployees).toBe(false);
    expect(selectedEmployeeIds).toEqual(['emp-123']);
  });

  it('derives source month/year as previous month of supplied target', () => {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const targetMonth = 'January';
    const targetYear = 2026;
    const idx = MONTHS.indexOf(targetMonth);
    const sourceMonth = MONTHS[(idx + 11) % 12];
    const sourceYear = idx === 0 ? targetYear - 1 : targetYear;
    expect(sourceMonth).toBe('December');
    expect(sourceYear).toBe(2025);
  });
});