import { describe, it, expect } from 'vitest';
import { deriveOrgKpiCounts, scopedRowsSignature } from '@/lib/orgKpiCounts';

describe('deriveOrgKpiCounts', () => {
  it('uses mapped count as canonical and reports hidden rows', () => {
    const r = deriveOrgKpiCounts({
      mappedEmployeeIds: new Array(55).fill(0).map((_, i) => `e${i}`),
      visibleRows: new Array(50).fill({ achievedValue: null }),
    });
    expect(r.mappedCount).toBe(55);
    expect(r.visibleCount).toBe(50);
    expect(r.hiddenCount).toBe(5);
  });

  it('falls back to visibleRows length when mapping is missing', () => {
    const r = deriveOrgKpiCounts({ mappedEmployeeIds: [], visibleRows: new Array(7).fill({}) });
    expect(r.mappedCount).toBe(7);
    expect(r.hiddenCount).toBe(0);
  });

  it('counts entered rows via predicate', () => {
    const r = deriveOrgKpiCounts({
      mappedEmployeeIds: new Array(3).fill('x'),
      visibleRows: [{ v: 1 }, { v: null }, { v: 5 }],
      enteredPredicate: (row: any) => row.v !== null,
    });
    expect(r.enteredCount).toBe(2);
  });
});

describe('scopedRowsSignature', () => {
  it('changes when row count changes (period switch 55 -> 50)', () => {
    const a = scopedRowsSignature(new Array(55).fill(0).map((_, i) => ({ scopeId: `e${i}` })));
    const b = scopedRowsSignature(new Array(50).fill(0).map((_, i) => ({ scopeId: `e${i}` })));
    expect(a).not.toBe(b);
  });

  it('is stable for same id set regardless of order', () => {
    const a = scopedRowsSignature([{ scopeId: 'b' }, { scopeId: 'a' }, { scopeId: 'c' }]);
    const b = scopedRowsSignature([{ scopeId: 'a' }, { scopeId: 'b' }, { scopeId: 'c' }]);
    expect(a).toBe(b);
  });
});
