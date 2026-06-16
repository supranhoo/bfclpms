import { describe, it, expect } from 'vitest';

/**
 * POLICY §112 (June 2026 RCA) — Untouched-zero guard MUST be
 * DB-aware. Only block when the local `0` has not yet been
 * persisted to `org_kpi_values.achieved_value`. A saved 0
 * (dbAchievedValue === 0) must be allowed to propagate even
 * when the row was not re-touched this session.
 *
 * Mirrors the predicate in
 * `OrgKpiDataEntry.executeSaveAndPropagate` (per-scope loop).
 */
type Row = {
  achievedValue: number | null;
  dbAchievedValue?: number | null;
  isNa?: boolean;
  _touched?: boolean;
};

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

describe('Org KPI untouched-zero propagation guard (POLICY §112)', () => {
  it('blocks untouched 0 that was never persisted to OKV', () => {
    expect(
      shouldSkipAsUntouchedZero({ achievedValue: 0, dbAchievedValue: null }),
    ).toBe(true);
  });

  it('allows untouched 0 when the DB already has 0 persisted', () => {
    expect(
      shouldSkipAsUntouchedZero({ achievedValue: 0, dbAchievedValue: 0 }),
    ).toBe(false);
  });

  it('allows touched 0 even when DB has not caught up yet', () => {
    expect(
      shouldSkipAsUntouchedZero({
        achievedValue: 0,
        dbAchievedValue: null,
        _touched: true,
      }),
    ).toBe(false);
  });

  it('does not block non-zero values', () => {
    expect(
      shouldSkipAsUntouchedZero({ achievedValue: 5, dbAchievedValue: null }),
    ).toBe(false);
  });

  it('does not block N/A rows', () => {
    expect(
      shouldSkipAsUntouchedZero({ achievedValue: 0, isNa: true }),
    ).toBe(false);
  });
});
