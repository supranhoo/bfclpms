import { describe, it, expect } from 'vitest';

/**
 * POLICY §ORG-KPI-PROPAGATION — chained Save → Propagate handoff.
 *
 * After `handleCardSave` persists, `executeSaveAndPropagate` MUST treat
 * the in-memory scoped rows as DB-confirmed for this action. Otherwise
 * the stale pre-save `dbAchievedValue` (typically `null` for fresh
 * entries) causes the untouched-zero guard to misclassify freshly
 * saved `0` values as "unsaved" → false destructive toast.
 *
 * This test mirrors the predicate used in
 * `OrgKpiDataEntry.executeSaveAndPropagate` after the post-save
 * promotion step.
 */
type Row = {
  scopeId: string;
  achievedValue: number | null;
  isNa?: boolean;
  dbAchievedValue?: number | null;
  _touched?: boolean;
};

function promotePersistedRows(rows: Row[]): Row[] {
  return rows.map((sv) => {
    if (sv.achievedValue === null && !sv.isNa) return sv;
    return {
      ...sv,
      dbAchievedValue: sv.isNa ? null : sv.achievedValue,
      _touched: true,
    };
  });
}

function shouldSkipAsUntouchedZero(sv: Row): boolean {
  const dbVal = sv.dbAchievedValue;
  const zeroSavedToDb = dbVal === 0;
  return (
    !sv._touched &&
    sv.achievedValue === 0 &&
    !sv.isNa &&
    !zeroSavedToDb
  );
}

describe('Org KPI chained Save → Propagate handoff', () => {
  it('saved 0 is propagatable after the post-save promotion', () => {
    const input: Row[] = [{ scopeId: 'a', achievedValue: 0, dbAchievedValue: null, _touched: false }];
    const promoted = promotePersistedRows(input);
    expect(promoted[0].dbAchievedValue).toBe(0);
    expect(shouldSkipAsUntouchedZero(promoted[0])).toBe(false);
  });

  it('null rows are left alone (do not get a false dbAchievedValue=0)', () => {
    const input: Row[] = [{ scopeId: 'a', achievedValue: null, dbAchievedValue: null }];
    const promoted = promotePersistedRows(input);
    expect(promoted[0].dbAchievedValue ?? null).toBe(null);
  });

  it('N/A rows null out the DB value but mark touched', () => {
    const input: Row[] = [{ scopeId: 'a', achievedValue: null, isNa: true }];
    const promoted = promotePersistedRows(input);
    expect(promoted[0].dbAchievedValue).toBe(null);
    expect(promoted[0]._touched).toBe(true);
  });

  it('non-zero values are also promoted as DB-confirmed', () => {
    const input: Row[] = [{ scopeId: 'a', achievedValue: 7, dbAchievedValue: 3, _touched: false }];
    const promoted = promotePersistedRows(input);
    expect(promoted[0].dbAchievedValue).toBe(7);
    expect(promoted[0]._touched).toBe(true);
  });
});

/**
 * POLICY §ORG-KPI-PROPAGATION — half-propagation forward guard MUST
 * subtract already-propagated (snapshot truth) and past-`kra_set`
 * employees from the "missed" set, otherwise rows propagated in a
 * previous session light up a false destructive Repair-Gap toast.
 */
function computeMissed(input: {
  expected: string[];
  propagatedThisClick: string[];
  alreadyPropagatedSnapshot: string[];
  pastKraSet: string[];
}): string[] {
  const propagatedSet = new Set(input.propagatedThisClick);
  const alreadySnap = new Set(input.alreadyPropagatedSnapshot);
  const past = new Set(input.pastKraSet);
  return input.expected.filter((eid) => {
    if (propagatedSet.has(eid)) return false;
    if (alreadySnap.has(eid)) return false;
    if (past.has(eid)) return false;
    return true;
  });
}

describe('Org KPI half-propagation forward guard (snapshot-aware)', () => {
  it('does not flag employees already propagated in a prior session', () => {
    const missed = computeMissed({
      expected: ['e1', 'e2', 'e3'],
      propagatedThisClick: [],
      alreadyPropagatedSnapshot: ['e1', 'e2', 'e3'],
      pastKraSet: [],
    });
    expect(missed).toEqual([]);
  });

  it('does not flag reviewer-locked employees (past kra_set)', () => {
    const missed = computeMissed({
      expected: ['e1', 'e2'],
      propagatedThisClick: [],
      alreadyPropagatedSnapshot: [],
      pastKraSet: ['e1', 'e2'],
    });
    expect(missed).toEqual([]);
  });

  it('still flags truly missing employees in kra_set', () => {
    const missed = computeMissed({
      expected: ['e1', 'e2', 'e3'],
      propagatedThisClick: ['e1'],
      alreadyPropagatedSnapshot: [],
      pastKraSet: [],
    });
    expect(missed.sort()).toEqual(['e2', 'e3']);
  });

  it('subtracts all three truth sets in combination', () => {
    const missed = computeMissed({
      expected: ['e1', 'e2', 'e3', 'e4', 'e5'],
      propagatedThisClick: ['e1'],
      alreadyPropagatedSnapshot: ['e2'],
      pastKraSet: ['e3'],
    });
    expect(missed.sort()).toEqual(['e4', 'e5']);
  });
});
