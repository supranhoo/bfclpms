import { describe, it, expect } from 'vitest';
import {
  applyDailyGridFilters,
  paginate,
  pageCount,
  hasActiveFilters,
  EMPTY_FILTERS,
} from '@/lib/incentiveGrid';

const mkEmp = (i: number) => ({
  id: `e${i}`,
  employee_code: String(100000 + i),
  full_name: i === 7 ? 'Aabid Hussain' : `Employee ${i}`,
  designation: i % 2 === 0 ? 'Helper' : 'Engineer',
  departments: { name: i % 3 === 0 ? 'FAD-Metal Handling' : 'Commercial-Plant' },
});

const rows = Array.from({ length: 2600 }, (_, i) => mkEmp(i));
const rateOf = () => 490.62;

describe('incentiveGrid helpers', () => {
  it('global search matches across fields', () => {
    const out = applyDailyGridFilters(rows, { ...EMPTY_FILTERS, global: 'aabid' }, rateOf);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('e7');
  });

  it('column filter narrows by designation', () => {
    const out = applyDailyGridFilters(rows, { ...EMPTY_FILTERS, designation: 'helper' }, rateOf);
    expect(out.every(r => r.designation === 'Helper')).toBe(true);
    expect(out.length).toBe(1300);
  });

  it('rate range filter excludes out-of-range', () => {
    const inRange = applyDailyGridFilters(rows, { ...EMPTY_FILTERS, rateMin: '400', rateMax: '500' }, rateOf);
    const outRange = applyDailyGridFilters(rows, { ...EMPTY_FILTERS, rateMin: '500' }, rateOf);
    expect(inRange.length).toBe(2600);
    expect(outRange.length).toBe(0);
  });

  it('paginate returns the correct slice past row 1000', () => {
    const page21 = paginate(rows, 20, 50); // rows 1000–1049
    expect(page21).toHaveLength(50);
    expect(page21[0].id).toBe('e1000');
    expect(page21[49].id).toBe('e1049');
  });

  it('pageCount handles totals correctly', () => {
    expect(pageCount(2600, 50)).toBe(52);
    expect(pageCount(0, 50)).toBe(1);
    expect(pageCount(1, 50)).toBe(1);
  });

  it('hasActiveFilters detects any non-empty value', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, name: 'x' })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, rateMin: '100' })).toBe(true);
  });

  it('edits to a row keyed by id survive paging (state model invariant)', () => {
    // Simulates the localData[empId] pattern: pagination doesn't mutate the map.
    const localData: Record<string, Record<string, number>> = {};
    const page1 = paginate(rows, 0, 50);
    localData[page1[0].id] = { '5': 10 };
    // navigate to page 2
    paginate(rows, 1, 50);
    // back to page 1 — entry still there
    expect(localData[page1[0].id]['5']).toBe(10);
  });
});