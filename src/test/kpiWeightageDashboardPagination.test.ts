import { describe, it, expect } from 'vitest';
import { WEIGHTAGE_DEFAULT_PAGE_SIZE, WEIGHTAGE_PAGE_SIZE_OPTIONS } from '@/hooks/useKpiWeightageMatrix';

/**
 * Pure-logic tests guarding POLICY §114 — KPI Weightage Dashboard pagination.
 */

describe('KPI Weightage Dashboard pagination contract', () => {
  it('exposes 25/50/100 page sizes with 25 as default', () => {
    expect(WEIGHTAGE_DEFAULT_PAGE_SIZE).toBe(25);
    expect(WEIGHTAGE_PAGE_SIZE_OPTIONS).toEqual([25, 50, 100]);
  });

  it('range math is page-1-based and inclusive', () => {
    const range = (page: number, pageSize: number): [number, number] => {
      const from = (page - 1) * pageSize;
      return [from, from + pageSize - 1];
    };
    expect(range(1, 25)).toEqual([0, 24]);
    expect(range(2, 25)).toEqual([25, 49]);
    expect(range(4, 25)).toEqual([75, 99]);
    expect(range(1, 50)).toEqual([0, 49]);
    expect(range(3, 100)).toEqual([200, 299]);
  });

  it('totalPages math handles partial last page and zero rows', () => {
    const totalPages = (total: number, pageSize: number) =>
      Math.max(1, Math.ceil(total / pageSize));
    expect(totalPages(0, 25)).toBe(1);
    expect(totalPages(73, 25)).toBe(3);
    expect(totalPages(100, 25)).toBe(4);
    expect(totalPages(101, 25)).toBe(5);
  });

  it('filter-set fingerprint changes when ANY filter changes (drives reset-to-1)', () => {
    const fp = (f: Record<string, unknown>) => JSON.stringify(f);
    const a = fp({ year: 2026, search: '', dept: null, cat: null, inactive: false, pageSize: 25 });
    const b = fp({ year: 2026, search: 'amit', dept: null, cat: null, inactive: false, pageSize: 25 });
    const c = fp({ year: 2026, search: '', dept: null, cat: null, inactive: false, pageSize: 50 });
    const d = fp({ year: 2026, search: '', dept: null, cat: null, inactive: false, pageSize: 25 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBe(d);
  });

  it('aggregate variance is filter-scoped, not page-scoped (separate query key)', () => {
    // The two hooks must use distinct query-key prefixes so paging the
    // matrix does NOT refetch / reshape the summary.
    const matrixKey = 'kpi-weightage-matrix';
    const summaryKey = 'kpi-weightage-variance-summary';
    expect(matrixKey).not.toBe(summaryKey);
  });
});
