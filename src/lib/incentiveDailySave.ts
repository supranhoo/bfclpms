/**
 * ADR-245 / POLICY §INC-DAILY-ENTRY-NO-SILENT-LOSS
 *
 * Pure logic for saving Production Daily Grid cells without ever destroying
 * days the operator does not have loaded.
 *
 * Contract:
 *  1. Only day keys inside the loaded (visible) window may be written.
 *  2. A day is written only when the grid actually holds a value for it —
 *     an employee whose row never hydrated contributes nothing.
 *  3. Any save that would reduce an employee's stored tonnage inside the
 *     visible window is reported as a "shrink" and must be confirmed.
 */

export type DayValues = Record<string, number>;

export interface MergeRow {
  program_id: string;
  employee_id: string;
  month: string;
  year: number;
  values: DayValues;
}

export interface ShrinkWarning {
  employee_id: string;
  before: number;
  after: number;
  droppedDays: number[];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function sumDays(values: DayValues | undefined, days: number[]): number {
  if (!values) return 0;
  return days.reduce((s, d) => s + num(values[String(d)]), 0);
}

/**
 * Builds the merge payload. Employees with no loaded value for any visible
 * day are skipped entirely (they cannot be wiped by omission).
 */
export function buildMergePayload(params: {
  programId: string;
  month: string;
  year: number;
  employeeIds: string[];
  localData: Record<string, DayValues>;
  visibleDays: number[];
}): MergeRow[] {
  const { programId, month, year, employeeIds, localData, visibleDays } = params;
  const rows: MergeRow[] = [];
  for (const empId of employeeIds) {
    const local = localData[empId];
    if (!local) continue;
    const values: DayValues = {};
    for (const d of visibleDays) {
      const key = String(d);
      if (Object.prototype.hasOwnProperty.call(local, key)) {
        values[key] = num(local[key]);
      }
    }
    if (Object.keys(values).length === 0) continue;
    rows.push({ program_id: programId, employee_id: empId, month, year, values });
  }
  return rows;
}

/**
 * Detects saves that would lower stored production inside the visible window,
 * either by zeroing values or by omitting days that currently hold data.
 */
export function detectShrink(params: {
  rows: MergeRow[];
  dbValues: Record<string, DayValues>;
  visibleDays: number[];
}): ShrinkWarning[] {
  const { rows, dbValues, visibleDays } = params;
  const warnings: ShrinkWarning[] = [];
  for (const row of rows) {
    const db = dbValues[row.employee_id] || {};
    const before = sumDays(db, visibleDays);
    if (before <= 0) continue;
    // Merged view = stored days overlaid with the days being written.
    const merged: DayValues = { ...db, ...row.values };
    const after = sumDays(merged, visibleDays);
    if (after >= before) continue;
    const droppedDays = visibleDays.filter(
      (d) => num(db[String(d)]) > num(merged[String(d)]),
    );
    warnings.push({ employee_id: row.employee_id, before, after, droppedDays });
  }
  return warnings;
}