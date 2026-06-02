import { describe, it, expect } from 'vitest';
import { applyFieldOverrides, applyAndFilter } from './applyFieldOverrides';
import type { ReportFieldOverrideRow, ReportFieldRegistryRow } from './types';

const reg: ReportFieldRegistryRow[] = [
  { report_id: 'RPT-X', field_key: 'a', default_label: 'A', default_sort: 10, is_required: true,  is_renamable: false, data_type: null },
  { report_id: 'RPT-X', field_key: 'b', default_label: 'B', default_sort: 20, is_required: false, is_renamable: true,  data_type: null },
  { report_id: 'RPT-X', field_key: 'c', default_label: 'C', default_sort: 30, is_required: false, is_renamable: true,  data_type: null },
];

function ov(field_key: string, patch: Partial<ReportFieldOverrideRow>): ReportFieldOverrideRow {
  return {
    id: field_key, report_id: 'RPT-X', field_key, client_id: null,
    custom_label: null, custom_sort: null, is_hidden: false, is_active: true,
    updated_by: null, updated_at: '2026-06-02T00:00:00Z',
    ...patch,
  };
}

describe('applyFieldOverrides', () => {
  it('returns defaults when there are no overrides', () => {
    const res = applyFieldOverrides(reg, []);
    expect(res.map((r) => r.field_key)).toEqual(['a', 'b', 'c']);
    expect(res.every((r) => !r.is_overridden)).toBe(true);
  });

  it('reorders by custom_sort', () => {
    const res = applyFieldOverrides(reg, [ov('c', { custom_sort: 5 })]);
    expect(res.map((r) => r.field_key)).toEqual(['c', 'a', 'b']);
    expect(res.find((r) => r.field_key === 'c')!.is_overridden).toBe(true);
  });

  it('renames only renamable fields', () => {
    const res = applyFieldOverrides(reg, [
      ov('a', { custom_label: 'Alpha' }), // non-renamable → ignored
      ov('b', { custom_label: 'Bravo' }),
    ]);
    expect(res.find((r) => r.field_key === 'a')!.label).toBe('A');
    expect(res.find((r) => r.field_key === 'b')!.label).toBe('Bravo');
  });

  it('refuses to hide required fields', () => {
    const res = applyFieldOverrides(reg, [ov('a', { is_hidden: true })]);
    expect(res.find((r) => r.field_key === 'a')!.is_hidden).toBe(false);
  });

  it('ignores inactive overrides', () => {
    const res = applyFieldOverrides(reg, [ov('b', { custom_label: 'X', is_active: false })]);
    expect(res.find((r) => r.field_key === 'b')!.label).toBe('B');
  });

  it('applyAndFilter strips hidden fields', () => {
    const res = applyAndFilter(reg, [ov('c', { is_hidden: true })]);
    expect(res.map((r) => r.field_key)).toEqual(['a', 'b']);
  });
});