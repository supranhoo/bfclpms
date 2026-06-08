import { describe, it, expect } from 'vitest';
import {
  isRowInAuditorScope,
  matchesCategoryFilter,
} from '@/lib/bulkAuditScopeFilter';

const row = (kpi: string, emp: string, cat: string | null = null) => ({
  kpi_id: kpi, employee_id: emp, category_id: cat,
});

describe('Bulk Review — multi-category client filter', () => {
  const rows = [
    row('k1', 'e1', 'cat-A'),
    row('k2', 'e2', 'cat-B'),
    row('k3', 'e3', 'cat-C'),
    row('k4', 'e4', null),
  ];

  it('returns every row when no categories are selected', () => {
    expect(rows.filter(r => matchesCategoryFilter(r, []))).toHaveLength(4);
  });

  it('filters to the union of selected categories (the bug-fix case: 2+ picked)', () => {
    const out = rows.filter(r => matchesCategoryFilter(r, ['cat-A', 'cat-C']));
    expect(out.map(r => r.kpi_id)).toEqual(['k1', 'k3']);
  });

  it('excludes rows with NULL category_id when any filter is active', () => {
    const out = rows.filter(r => matchesCategoryFilter(r, ['cat-A']));
    expect(out.map(r => r.kpi_id)).toEqual(['k1']);
  });
});

describe('Bulk Review — "My audit scope only" predicate', () => {
  const scope = {
    employeeIds: new Set(['e-alice']),
    kpiIds: new Set(['kpi-shared']),
  };

  it('matches when the KPI is auditor-assigned (KPI-level)', () => {
    expect(isRowInAuditorScope(row('kpi-shared', 'e-bob'), scope)).toBe(true);
  });

  it('matches when the employee is auditor-assigned (employee-level)', () => {
    expect(isRowInAuditorScope(row('kpi-other', 'e-alice'), scope)).toBe(true);
  });

  it('rejects rows outside the auditor scope', () => {
    expect(isRowInAuditorScope(row('kpi-other', 'e-bob'), scope)).toBe(false);
  });

  it('returns the same row in both branches without double-counting (set semantics)', () => {
    const rows = [
      row('kpi-shared', 'e-alice'),
      row('kpi-shared', 'e-bob'),
      row('kpi-x', 'e-alice'),
      row('kpi-x', 'e-bob'),
    ];
    const inScope = rows.filter(r => isRowInAuditorScope(r, scope));
    expect(inScope.map(r => `${r.kpi_id}|${r.employee_id}`)).toEqual([
      'kpi-shared|e-alice',
      'kpi-shared|e-bob',
      'kpi-x|e-alice',
    ]);
  });
});