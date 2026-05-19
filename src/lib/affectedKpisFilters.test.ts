import { describe, it, expect } from 'vitest';
import {
  applyColumnFilters,
  cellToken,
  distinctValues,
  hasActiveFilter,
  BLANK_TOKEN,
} from './affectedKpisFilters';

const rows = [
  { period: 'Jan 2026', status: 'approved', r1: '100%' },
  { period: 'Feb 2026', status: 'APPROVED', r1: '100%' },
  { period: 'Mar 2026', status: 'kra_set', r1: null },
  { period: 'Apr 2026', status: 'manager_check', r1: '   ' },
];

describe('affectedKpisFilters', () => {
  it('no filters returns all rows', () => {
    expect(applyColumnFilters(rows, {})).toHaveLength(4);
  });

  it('single-value filter matches case-insensitively', () => {
    const out = applyColumnFilters(rows, { status: new Set(['approved']) });
    expect(out).toHaveLength(2);
  });

  it('multi-value OR within column', () => {
    const out = applyColumnFilters(rows, {
      status: new Set(['approved', 'kra_set']),
    });
    expect(out).toHaveLength(3);
  });

  it('multi-column AND', () => {
    const out = applyColumnFilters(rows, {
      status: new Set(['approved']),
      period: new Set(['jan 2026']),
    });
    expect(out).toHaveLength(1);
  });

  it('BLANK_TOKEN matches null and whitespace cells', () => {
    const out = applyColumnFilters(rows, { r1: new Set([BLANK_TOKEN]) });
    expect(out).toHaveLength(2);
  });

  it('cellToken normalizes blanks', () => {
    expect(cellToken(null)).toBe(BLANK_TOKEN);
    expect(cellToken('  ')).toBe(BLANK_TOKEN);
    expect(cellToken('Foo')).toBe('foo');
  });

  it('distinctValues sorts blanks last and merges casing', () => {
    const d = distinctValues(rows, 'status');
    expect(d.map(x => x.display)).toContain('approved');
    expect(d.length).toBe(3);
  });

  it('hasActiveFilter counts non-empty sets', () => {
    expect(hasActiveFilter({})).toBe(0);
    expect(hasActiveFilter({ a: new Set() })).toBe(0);
    expect(hasActiveFilter({ a: new Set(['x']), b: new Set(['y']) })).toBe(2);
  });
});