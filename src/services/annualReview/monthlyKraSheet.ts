import { supabase } from '@/integrations/supabase/client';
import { FY_MONTHS, type FyMonth } from './carryKraScore';
import type { ComprehensiveRow } from './comprehensiveReport';

/**
 * ADR-188 / POLICY §RPT-MONTHLY-KRA-SHEET
 *
 * "Monthly KRA Scores" sheet for the Annual Review comprehensive export.
 *
 * Shows, for every employee mapped to a KRA-driven template (a template whose
 * scoring carries a `carry_kra` system slot), the July→June monthly KPI
 * performance that feeds their annual KRA points.
 *
 * Aggregation parity: the server RPC
 * `get_annual_review_monthly_kra_matrix` is the set-based form of
 * `compute_carry_kra_contribution` (weighted average of the authoritative
 * score final → auditor → manager → self, excluding `is_na`). Keeping the
 * maths server-side avoids one round-trip per employee, which previously
 * timed out for large cycles.
 */

/** Hard cap so a huge cycle cannot blow up the workbook (parity with other exports). */
export const MONTHLY_KRA_ROW_CAP = 5000;

export interface MonthlyKraCell {
  rating: number | null;
  pct: number | null;
  kpiCount: number;
}

export type MonthlyKraMatrix = Map<string, Partial<Record<FyMonth, MonthlyKraCell>>>;

interface MatrixRpcRow {
  employee_id: string;
  review_period: string;
  avg_rating: number | string | null;
  pct: number | string | null;
  kpi_count: number | null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Pure: fold RPC rows into the per-employee month map. Exported for tests. */
export function foldMatrixRows(rows: MatrixRpcRow[]): MonthlyKraMatrix {
  const map: MonthlyKraMatrix = new Map();
  for (const r of rows ?? []) {
    if (!r?.employee_id) continue;
    const month = r.review_period as FyMonth;
    if (!FY_MONTHS.includes(month)) continue;
    const bucket = map.get(r.employee_id) ?? {};
    bucket[month] = {
      rating: num(r.avg_rating),
      pct: num(r.pct),
      kpiCount: Number(r.kpi_count ?? 0) || 0,
    };
    map.set(r.employee_id, bucket);
  }
  return map;
}

/** Batched fetch (500 employees per call). Fails soft: returns an empty matrix. */
export async function fetchMonthlyKraMatrix(
  employeeIds: string[],
  fyStart: number,
): Promise<MonthlyKraMatrix> {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0 || !Number.isFinite(fyStart)) return new Map();
  const all: MatrixRpcRow[] = [];
  for (const batch of chunk(ids, 500)) {
    const { data, error } = await (supabase as any).rpc(
      'get_annual_review_monthly_kra_matrix',
      { p_employee_ids: batch, p_fy_start: fyStart, p_exclude_na: true },
    );
    if (error) throw new Error(error.message);
    all.push(...((data ?? []) as MatrixRpcRow[]));
  }
  return foldMatrixRows(all);
}

/** Resolves the cycle's fiscal-year start (July year) from its id. */
export async function fetchCycleFyStart(cycleId: string | undefined): Promise<number | null> {
  if (!cycleId) return null;
  const { data, error } = await (supabase as any)
    .from('annual_review_cycles')
    .select('review_year')
    .eq('id', cycleId)
    .maybeSingle();
  if (error || !data?.review_year) return null;
  return Number(data.review_year) - 1;
}

export const MONTH_ABBR: Record<FyMonth, string> = {
  July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct',
  November: 'Nov', December: 'Dec', January: 'Jan', February: 'Feb',
  March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
};

/** Ordered header list for the sheet — exported so tests lock the column shape. */
export function monthlyKraHeaders(): string[] {
  const head = ['Employee Code', 'Name', 'Designation', 'Department', 'Business Unit', 'Template'];
  for (const m of FY_MONTHS) head.push(`${MONTH_ABBR[m]} /5`, `${MONTH_ABBR[m]} %`);
  return [...head, 'Months Scored', 'Avg /5', 'KRA Points', 'KRA Weight'];
}

export type MonthlyKraSheetRow = Record<string, string | number>;

/**
 * Pure builder — one row per KRA-template employee, in the order given.
 * Months with no scored KPI stay blank (never `0`, which would read as a
 * genuine zero rating).
 */
export function buildMonthlyKraRows(
  rows: ComprehensiveRow[],
  matrix: MonthlyKraMatrix,
  isKraTemplate: (templateId: string | null | undefined) => boolean,
): MonthlyKraSheetRow[] {
  const out: MonthlyKraSheetRow[] = [];
  for (const r of rows) {
    if (!isKraTemplate(r.template_id)) continue;
    const months = matrix.get(r.employee_id) ?? {};
    const row: MonthlyKraSheetRow = {
      'Employee Code': r.employee_code ?? '',
      'Name': r.employee_name ?? '',
      'Designation': r.designation ?? '',
      'Department': r.department_name ?? '',
      'Business Unit': r.business_unit_name ?? '',
      'Template': r.template_name ?? '',
    };
    let sum = 0;
    let scored = 0;
    for (const m of FY_MONTHS) {
      const cell = months[m];
      const rating = cell?.rating ?? null;
      row[`${MONTH_ABBR[m]} /5`] = rating ?? '';
      row[`${MONTH_ABBR[m]} %`] = cell?.pct ?? '';
      if (rating != null) { sum += rating; scored += 1; }
    }
    row['Months Scored'] = scored;
    row['Avg /5'] = scored > 0 ? Number((sum / scored).toFixed(2)) : '';
    row['KRA Points'] = r.kra_points ?? '';
    row['KRA Weight'] = r.kra_weight ?? '';
    out.push(row);
    if (out.length >= MONTHLY_KRA_ROW_CAP) break;
  }
  return out;
}
