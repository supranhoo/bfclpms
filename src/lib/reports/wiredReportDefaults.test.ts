/**
 * Contract tests for the default field sets registered by each wired
 * report page. These mirror the literal `*_DEFAULT_FIELDS` arrays declared
 * in the page files. Keep them in sync — if a page adds/removes a field,
 * update the matching contract here.
 *
 * What we assert:
 *  - defaults pass through unchanged when there are no overrides
 *  - renames apply only to renamable, active overrides
 *  - hiding refuses required fields, accepts optional ones
 *  - custom sort reorders the resolved list
 */
import { describe, it, expect } from 'vitest';
import { applyFieldOverrides, applyAndFilter } from './applyFieldOverrides';
import type { ReportFieldOverrideRow, ReportFieldRegistryRow } from './types';

type DefaultField = {
  field_key: string;
  default_label: string;
  default_sort: number;
  is_required?: boolean;
  is_renamable?: boolean;
};

function toRegistry(reportId: string, defaults: ReadonlyArray<DefaultField>): ReportFieldRegistryRow[] {
  return defaults.map((d) => ({
    report_id: reportId,
    field_key: d.field_key,
    default_label: d.default_label,
    default_sort: d.default_sort,
    is_required: d.is_required ?? false,
    is_renamable: d.is_renamable ?? true,
    data_type: null,
  }));
}

function ov(reportId: string, field_key: string, patch: Partial<ReportFieldOverrideRow>): ReportFieldOverrideRow {
  return {
    id: `${reportId}::${field_key}`,
    report_id: reportId,
    field_key,
    client_id: null,
    custom_label: null,
    custom_sort: null,
    is_hidden: false,
    is_active: true,
    updated_by: null,
    updated_at: '2026-06-02T00:00:00Z',
    ...patch,
  };
}

// ── Wired report contracts ────────────────────────────────────────────
// Keep in lockstep with the page-level `*_DEFAULT_FIELDS` arrays.

const WIRED_REPORTS: Record<string, ReadonlyArray<DefaultField>> = {
  'RPT-MAT-001': [
    { field_key: 'sr_no',          default_label: 'Sr. No.',        default_sort: 10, is_required: true },
    { field_key: 'category',       default_label: 'Category',       default_sort: 20 },
    { field_key: 'kra',            default_label: 'KRA',            default_sort: 30 },
    { field_key: 'kpi',            default_label: 'KPI',            default_sort: 40, is_required: true },
    { field_key: 'weightage',      default_label: 'Weightage',      default_sort: 50 },
    { field_key: 'employee_count', default_label: 'Employee Count', default_sort: 60 },
  ],
  'RPT-WFR-001': [
    { field_key: 'employee',   default_label: 'Employee',   default_sort: 10, is_required: true },
    { field_key: 'department', default_label: 'Department', default_sort: 20 },
    { field_key: 'template',   default_label: 'Template',   default_sort: 30 },
    { field_key: 'source',     default_label: 'Source',     default_sort: 40 },
  ],
  'RPT-INC-001': [
    { field_key: 'employee_code', default_label: 'Employee Code',  default_sort: 10, is_required: true },
    { field_key: 'employee_name', default_label: 'Employee Name',  default_sort: 20, is_required: true },
    { field_key: 'department',    default_label: 'Department',     default_sort: 30 },
    { field_key: 'affected_month',default_label: 'Affected Month', default_sort: 40 },
    { field_key: 'original_score',default_label: 'Original Score', default_sort: 50 },
    { field_key: 'adjusted_score',default_label: 'Adjusted Score', default_sort: 60 },
  ],
};

describe('wired report default field sets', () => {
  for (const [reportId, defaults] of Object.entries(WIRED_REPORTS)) {
    describe(reportId, () => {
      const registry = toRegistry(reportId, defaults);

      it('passes defaults through unchanged with no overrides', () => {
        const out = applyFieldOverrides(registry, []);
        expect(out.map((f) => f.field_key)).toEqual(defaults.map((d) => d.field_key));
        expect(out.map((f) => f.label)).toEqual(defaults.map((d) => d.default_label));
        expect(out.every((f) => !f.is_overridden)).toBe(true);
      });

      it('renames an optional renamable field', () => {
        const target = defaults.find((d) => !(d.is_required));
        if (!target) return; // every field is required → nothing to test
        const out = applyFieldOverrides(registry, [
          ov(reportId, target.field_key, { custom_label: 'Custom!' }),
        ]);
        const row = out.find((f) => f.field_key === target.field_key)!;
        expect(row.label).toBe('Custom!');
        expect(row.is_overridden).toBe(true);
      });

      it('refuses to hide a required field', () => {
        const req = defaults.find((d) => d.is_required);
        if (!req) return;
        const out = applyAndFilter(registry, [
          ov(reportId, req.field_key, { is_hidden: true }),
        ]);
        // Required field must still be present.
        expect(out.some((f) => f.field_key === req.field_key)).toBe(true);
      });

      it('hides an optional field via applyAndFilter', () => {
        const opt = defaults.find((d) => !d.is_required);
        if (!opt) return;
        const out = applyAndFilter(registry, [
          ov(reportId, opt.field_key, { is_hidden: true }),
        ]);
        expect(out.some((f) => f.field_key === opt.field_key)).toBe(false);
      });

      it('reorders by custom_sort', () => {
        if (defaults.length < 2) return;
        const last = defaults[defaults.length - 1];
        const out = applyFieldOverrides(registry, [
          ov(reportId, last.field_key, { custom_sort: 1 }),
        ]);
        expect(out[0].field_key).toBe(last.field_key);
      });

      it('ignores inactive overrides', () => {
        const opt = defaults.find((d) => !d.is_required);
        if (!opt) return;
        const out = applyFieldOverrides(registry, [
          ov(reportId, opt.field_key, { custom_label: 'Nope', is_active: false }),
        ]);
        expect(out.find((f) => f.field_key === opt.field_key)!.label).toBe(opt.default_label);
      });
    });
  }
});