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
