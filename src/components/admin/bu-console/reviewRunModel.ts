/**
 * ADR-286 — pure helpers for the Review Run worksheet.
 *
 * Keeps the grid component dumb: cell lookup, "is this cell still pending at
 * my stage", row/column selection sets and the run counters all live here so
 * they can be unit tested without React.
 */
import type { RunCell, RunEmployee, RunKpi } from '@/hooks/useBuConsoleRun';

export const RUN_STAGES: { value: string; label: string }[] = [
  { value: 'self_review', label: 'Self review' },
  { value: 'manager_check', label: 'Manager check' },
  { value: 'functional_manager_check', label: 'Functional manager' },
  { value: 'skip_level_check', label: 'Skip-level check' },
  { value: 'hr_pms_review', label: 'HR PMS review' },
  { value: 'audit', label: 'Audit' },
  { value: 'management_review', label: 'Management review' },
];

export const cellId = (kpiKey: string, employeeId: string) => `${kpiKey}::${employeeId}`;

export function buildCellMap(cells: RunCell[]): Map<string, RunCell> {
  const m = new Map<string, RunCell>();
  for (const c of cells) m.set(cellId(c.kpi_key, c.employee_id), c);
  return m;
}

/**
 * A cell still needs work at the run's stage when it is not N/A, not final and
 * carries no score in the stage column yet.
 */
export function isCellPending(cell: RunCell | undefined): boolean {
  if (!cell) return false;
  if (cell.is_na) return false;
  if (cell.final_score !== null && cell.final_score !== undefined) return false;
  return cell.stage_score === null || cell.stage_score === undefined;
}

/** Cells the viewer is allowed to move at this stage (server re-checks). */
export function isCellSelectable(cell: RunCell | undefined): boolean {
  if (!cell) return false;
  if (cell.final_score !== null && cell.final_score !== undefined) return false;
  return cell.actionable !== false;
}

export function countPending(cells: RunCell[]): number {
  return cells.reduce((n, c) => n + (isCellPending(c) ? 1 : 0), 0);
}

export function selectableIdsForKpi(
  kpiKey: string,
  employees: RunEmployee[],
  map: Map<string, RunCell>,
): string[] {
  const out: string[] = [];
  for (const e of employees) {
    const c = map.get(cellId(kpiKey, e.employee_id));
    if (isCellSelectable(c)) out.push(c!.kpi_id);
  }
  return out;
}

export function selectableIdsForEmployee(
  employeeId: string,
  kpis: RunKpi[],
  map: Map<string, RunCell>,
): string[] {
  const out: string[] = [];
  for (const k of kpis) {
    const c = map.get(cellId(k.kpi_key, employeeId));
    if (isCellSelectable(c)) out.push(c!.kpi_id);
  }
  return out;
}

export function toggleAll(current: Set<string>, ids: string[]): Set<string> {
  const next = new Set(current);
  const allOn = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allOn) next.delete(id);
    else next.add(id);
  }
  return next;
}

export interface RunCounters {
  cells: number;
  pending: number;
  done: number;
  na: number;
  locked: number;
}

export function runCounters(cells: RunCell[]): RunCounters {
  let pending = 0, done = 0, na = 0, locked = 0;
  for (const c of cells) {
    if (c.final_score !== null && c.final_score !== undefined) locked++;
    else if (c.is_na) na++;
    else if (c.stage_score !== null && c.stage_score !== undefined) done++;
    else pending++;
  }
  return { cells: cells.length, pending, done, na, locked };
}

/** Employees that share one value vs. those tuned differently (ADR-288). */
export function targetSpread(kpiKey: string, cells: RunCell[]): string[] {
  const set = new Set<string>();
  for (const c of cells) if (c.kpi_key === kpiKey) set.add(c.target_value ?? '—');
  return [...set];
}
