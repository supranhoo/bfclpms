import { describe, it, expect } from 'vitest';
import { applyFieldOverrides } from '@/lib/reports/applyFieldOverrides';
import type { ReportFieldRegistryRow } from '@/lib/reports/types';

/**
 * POLICY §RPT-FIELD-REGISTRY-MERGE — the DB field registry is additive over
 * in-code defaults. Mirrors the merge performed by useResolvedReportFields so
 * the rule is guarded without mounting React Query.
 */
const DEFAULTS = [
  { field_key: 'employee_code', default_label: 'Employee Code', default_sort: 30, is_required: true },
  { field_key: 'employee_status', default_label: 'Employee Status', default_sort: 45 },
  { field_key: 'pending_with', default_label: 'Pending With (Name)', default_sort: 145 },
];

function merge(reportId: string, dbRows: ReportFieldRegistryRow[]) {
  const keys = new Set(dbRows.map((r) => r.field_key));
  const missing: ReportFieldRegistryRow[] = DEFAULTS.filter((d) => !keys.has(d.field_key)).map((d) => ({
    report_id: reportId,
    field_key: d.field_key,
    default_label: d.default_label,
    default_sort: d.default_sort,
    is_required: d.is_required ?? false,
    is_renamable: true,
    data_type: null,
  }));
  return [...dbRows, ...missing];
}

const dbPartial: ReportFieldRegistryRow[] = [
  {
    report_id: 'RPT-KST-001', field_key: 'employee_code', default_label: 'Emp Code',
    default_sort: 30, is_required: true, is_renamable: true, data_type: null,
  },
];

describe('report field registry drift (§RPT-FIELD-REGISTRY-MERGE)', () => {
  it('keeps every in-code default when the DB registry is a partial subset', () => {
    const resolved = applyFieldOverrides(merge('RPT-KST-001', dbPartial), []);
    const keys = resolved.map((f) => f.field_key);
    expect(keys).toContain('pending_with');
    expect(keys).toContain('employee_status');
  });

  it('lets the DB row win where it exists (admin rename preserved)', () => {
    const resolved = applyFieldOverrides(merge('RPT-KST-001', dbPartial), []);
    expect(resolved.find((f) => f.field_key === 'employee_code')?.label).toBe('Emp Code');
  });

  it('honours an active override that hides a merged-in default field', () => {
    const resolved = applyFieldOverrides(merge('RPT-KST-001', dbPartial), [
      {
        report_id: 'RPT-KST-001', field_key: 'pending_with', custom_label: null,
        custom_sort: null, is_hidden: true, is_active: true,
      } as any,
    ]);
    expect(resolved.find((f) => f.field_key === 'pending_with')?.is_hidden).toBe(true);
  });

  it('sorts merged fields by their resolved sort order', () => {
    const resolved = applyFieldOverrides(merge('RPT-KST-001', dbPartial), []);
    expect(resolved.map((f) => f.field_key)).toEqual([
      'employee_code', 'employee_status', 'pending_with',
    ]);
  });
});
