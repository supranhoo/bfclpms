import { describe, it, expect } from 'vitest';
import { pagedSlice, totalPages } from '@/components/admin/kpi-standardization/RegistryPager';

describe('RegistryPager helpers', () => {
  const rows = Array.from({ length: 53 }, (_, i) => i);

  it('slices the correct page', () => {
    expect(pagedSlice(rows, 1, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pagedSlice(rows, 2, 10)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(pagedSlice(rows, 6, 10)).toEqual([50, 51, 52]);
  });

  it('returns empty for out-of-range pages', () => {
    expect(pagedSlice(rows, 99, 10)).toEqual([]);
  });

  it('clamps negative/zero page to first', () => {
    expect(pagedSlice(rows, 0, 10)).toEqual(pagedSlice(rows, 1, 10).slice(0, 0).concat([0,1,2,3,4,5,6,7,8,9]).slice(0,10));
  });

  it('totalPages computes ceil and floors at 1', () => {
    expect(totalPages(0, 25)).toBe(1);
    expect(totalPages(1, 25)).toBe(1);
    expect(totalPages(25, 25)).toBe(1);
    expect(totalPages(26, 25)).toBe(2);
    expect(totalPages(53, 10)).toBe(6);
  });
});