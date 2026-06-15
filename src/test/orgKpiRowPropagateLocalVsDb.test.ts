import { describe, it, expect } from 'vitest';

/**
 * POLICY §112 — Row-level Propagate is disabled when the local
 * achieved value diverges from the persisted `dbAchievedValue`, even
 * if the dirty flag was inadvertently cleared. Mirrors the predicate
 * used in `EmployeeRow` / `DepartmentRow` of
 * `src/components/admin/OrgKpiScopedEntryTable.tsx`.
 */
type Row = {
  achievedValue: number | null;
  dbAchievedValue?: number | null;
  isNa?: boolean;
};

function canPropagate(row: Row, isPropagating = false): boolean {
  const localMatchesDb =
    row.dbAchievedValue === undefined ||
    row.dbAchievedValue === row.achievedValue;
  return (
    (row.achievedValue !== null || !!row.isNa) &&
    !isPropagating &&
    localMatchesDb
  );
}

describe('Org KPI row Propagate vs persisted DB value (POLICY §112)', () => {
  it('blocks Propagate when local 0 has no persisted OKV value', () => {
    expect(canPropagate({ achievedValue: 0, dbAchievedValue: null })).toBe(false);
  });

  it('blocks Propagate when local value differs from persisted value', () => {
    expect(canPropagate({ achievedValue: 5, dbAchievedValue: 3 })).toBe(false);
  });

  it('allows Propagate when local value matches persisted value', () => {
    expect(canPropagate({ achievedValue: 5, dbAchievedValue: 5 })).toBe(true);
  });

  it('allows Propagate when row is N/A and persisted is null', () => {
    expect(canPropagate({ achievedValue: null, dbAchievedValue: null, isNa: true })).toBe(true);
  });

  it('blocks Propagate when nothing is entered', () => {
    expect(canPropagate({ achievedValue: null, dbAchievedValue: null })).toBe(false);
  });

  it('blocks Propagate while a propagation is already in flight', () => {
    expect(canPropagate({ achievedValue: 5, dbAchievedValue: 5 }, true)).toBe(false);
  });
});