import { describe, it, expect } from 'vitest';
import {
  fieldLabel,
  displayValue,
  categoryLabel,
  toExportRow,
  CATEGORY_OPTIONS,
  type ChangeHistoryRow,
} from '@/lib/reports/changeHistory';

const base: ChangeHistoryRow = {
  event_id: 'e1',
  occurred_at: '2026-07-31T05:00:00.000Z',
  category: 'employee_details',
  employee_id: 'emp-1',
  employee_name: 'Anup Kumar',
  employee_code: '101381',
  field_label: 'department_id',
  old_value: 'Operations',
  new_value: 'Maintenance',
  changed_by: 'usr-1',
  changed_by_name: 'Awadhesh Kumar Singh',
  context: null,
  total_count: 1,
};

describe('changeHistory presentation contract (ADR-213)', () => {
  it('labels known profile fields', () => {
    expect(fieldLabel('department_id')).toBe('Department');
    expect(fieldLabel('reporting_manager_id')).toBe('Reporting Manager');
    expect(fieldLabel('is_active')).toBe('Active');
    expect(fieldLabel('workflow_mapping')).toBe('Workflow Template');
  });

  it('labels annual-review reviewer slots dynamically', () => {
    expect(fieldLabel('reviewer_bu_head')).toBe('Reviewer — Bu Head');
  });

  it('title-cases unknown keys instead of leaking raw column names', () => {
    expect(fieldLabel('some_new_column')).toBe('Some New Column');
    expect(fieldLabel(null)).toBe('—');
  });

  it('never renders empty values as blanks', () => {
    expect(displayValue('')).toBe('—');
    expect(displayValue(null)).toBe('—');
    expect(displayValue('Yes')).toBe('Yes');
  });

  it('maps every category option to a human label', () => {
    for (const c of CATEGORY_OPTIONS) {
      expect(categoryLabel(c.value)).toBe(c.label);
    }
    expect(categoryLabel('unknown_cat')).toBe('Unknown Cat');
  });

  it('exports the same columns the table shows', () => {
    const row = toExportRow(base);
    expect(Object.keys(row)).toEqual([
      'Date & Time', 'Category', 'Employee Code', 'Employee',
      'What Changed', 'Old Value', 'New Value', 'Changed By', 'Context',
    ]);
    expect(row['What Changed']).toBe('Department');
    expect(row['Changed By']).toBe('Awadhesh Kumar Singh');
  });

  it('attributes automated changes to System when no actor exists', () => {
    expect(toExportRow({ ...base, changed_by: null, changed_by_name: null })['Changed By']).toBe('System');
    expect(toExportRow({ ...base, changed_by: 'u', changed_by_name: null })['Changed By']).toBe('System user');
  });
});

// ── ADR-215 ────────────────────────────────────────────────────────────────
describe('ADR-215 — reporting/org capture and uncapped export', () => {
  it('routes manager, department and designation changes to Reporting & Org', () => {
    expect(categoryForField('reporting_manager_id')).toBe('reporting_org');
    expect(categoryForField('functional_manager_id')).toBe('reporting_org');
    expect(categoryForField('department_id')).toBe('reporting_org');
    expect(categoryForField('designation')).toBe('reporting_org');
  });

  it('keeps status and plain detail fields out of Reporting & Org', () => {
    expect(categoryForField('is_active')).toBe('status');
    expect(categoryForField('employment_status')).toBe('status');
    expect(categoryForField('email')).toBe('employee_details');
    expect(categoryForField('mobile_number')).toBe('employee_details');
  });

  it('exposes Reporting & Org as a user-selectable filter with a readable label', () => {
    expect(CATEGORY_OPTIONS.map(o => o.value)).toContain('reporting_org');
    expect(categoryLabel('reporting_org')).toBe('Reporting & Org');
  });

  it('labels a manager change readably and shows resolved names, not ids', () => {
    const row = toExportRow({
      event_id: 'e1',
      occurred_at: '2026-07-31T10:00:00.000Z',
      category: 'reporting_org',
      employee_id: 'emp-1',
      employee_name: 'Anup Kumar',
      employee_code: '101381',
      field_label: 'reporting_manager_id',
      old_value: 'Awadhesh Kumar Singh',
      new_value: 'Umesh Mehta',
      changed_by: 'adm-1',
      changed_by_name: 'HR Admin',
      context: null,
      total_count: 1,
    });
    expect(row['Category']).toBe('Reporting & Org');
    expect(row['What Changed']).toBe('Reporting Manager');
    expect(row['Old Value']).toBe('Awadhesh Kumar Singh');
    expect(row['New Value']).toBe('Umesh Mehta');
  });

  it('the export ceiling is a runaway guard far above the old 5,000 business cap', () => {
    expect(CHANGE_HISTORY_EXPORT_CAP).toBeGreaterThan(5000);
    expect(CHANGE_HISTORY_EXPORT_CAP).toBe(100_000);
  });
});
