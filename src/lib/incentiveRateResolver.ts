/**
 * Shared production-rate resolver — SINGLE SOURCE OF TRUTH for incentive rate cascade.
 *
 * Used by BOTH:
 *   - The data-entry grid (src/components/incentive/ProductionDailyGrid.tsx)
 *   - The compute edge function (supabase/functions/compute-monthly-incentives/index.ts
 *     via a mirrored Deno copy at supabase/functions/_shared/incentiveRateResolver.ts).
 *
 * RCA (May 2026, BFCL): independent re-implementations of this cascade drifted, causing
 * the Incentive Report total (₹1,43,506) to disagree with the Data Entry Grand Total
 * (₹1,51,017). Codified per POLICY.md — production rate cascade MUST be computed by
 * this module; inline re-implementations are forbidden.
 */

export type RateSource = 'employee' | 'department' | 'bu' | 'company' | 'common' | 'none';

export interface ResolvedRate {
  employeeId: string;
  rate: number;
  source: RateSource;
}

export interface RateRow {
  rate_type: 'employee' | 'department' | 'bu' | 'company' | 'common' | string;
  employee_id?: string | null;
  entity_id?: string | null;
  rate_per_ton: number | string;
  effective_from?: string | null; // YYYY-MM-DD
}

/**
 * Pick the row with the latest effective_from <= targetDate.
 * Rows with null effective_from are treated as always-eligible (sorts last).
 */
export function pickLatestEffective<T extends { effective_from?: string | null }>(
  rows: T[],
  targetDate: string,
): T | null {
  const eligible = rows.filter((r) => !r.effective_from || r.effective_from <= targetDate);
  if (eligible.length === 0) return null;
  return eligible.reduce((best, cur) =>
    (cur.effective_from || '') > (best.effective_from || '') ? cur : best,
  );
}

/**
 * Resolve an employee's effective rate following the canonical 5-tier cascade:
 *   employee > department > bu > company > common
 *
 * Date-aware: each tier picks the latest row with effective_from <= targetDate.
 * Returns { rate: 0, source: 'none' } when no rate is configured.
 */
export function resolveEmployeeRate(
  employeeId: string,
  departmentId: string | null,
  buId: string | null,
  rates: RateRow[],
  companyId: string | null = null,
  targetDate: string = new Date().toISOString().slice(0, 10),
): ResolvedRate {
  // 1. Employee-specific
  const empRows = rates.filter((r) => r.rate_type === 'employee' && r.employee_id === employeeId);
  const emp = pickLatestEffective(empRows, targetDate);
  if (emp) return { employeeId, rate: Number(emp.rate_per_ton), source: 'employee' };

  // 2. Department-wise
  if (departmentId) {
    const deptRows = rates.filter((r) => r.rate_type === 'department' && r.entity_id === departmentId);
    const dept = pickLatestEffective(deptRows, targetDate);
    if (dept) return { employeeId, rate: Number(dept.rate_per_ton), source: 'department' };
  }

  // 3. BU-wise
  if (buId) {
    const buRows = rates.filter((r) => r.rate_type === 'bu' && r.entity_id === buId);
    const bu = pickLatestEffective(buRows, targetDate);
    if (bu) return { employeeId, rate: Number(bu.rate_per_ton), source: 'bu' };
  }

  // 4. Company-wise
  if (companyId) {
    const compRows = rates.filter((r) => r.rate_type === 'company' && r.entity_id === companyId);
    const comp = pickLatestEffective(compRows, targetDate);
    if (comp) return { employeeId, rate: Number(comp.rate_per_ton), source: 'company' };
  }

  // 5. Common
  const commonRows = rates.filter((r) => r.rate_type === 'common');
  const common = pickLatestEffective(commonRows, targetDate);
  if (common) return { employeeId, rate: Number(common.rate_per_ton), source: 'common' };

  return { employeeId, rate: 0, source: 'none' };
}

/**
 * Resolve the company-id for an employee using the canonical precedence shared by
 * the data-entry grid and the compute edge function:
 *
 *   1. profiles.company_id (direct multi-company assignment — UI Company filter parity)
 *   2. department → business_unit → division.company_id (org chain fallback)
 *
 * Returns null when no company can be resolved.
 */
export function resolveEmployeeCompanyId(args: {
  profileCompanyId?: string | null;
  departmentId?: string | null;
  deptToBu?: Map<string, string | null> | null;
  buToDivision?: Map<string, string | null> | null;
  divToCompany?: Map<string, string | null> | null;
  buToCompany?: Map<string, string | null> | null;
}): string | null {
  const direct = args.profileCompanyId ?? null;
  if (direct) return direct;

  const buId = args.departmentId ? (args.deptToBu?.get(args.departmentId) ?? null) : null;
  if (!buId) return null;

  const divisionId = args.buToDivision?.get(buId) ?? null;
  if (divisionId) {
    const fromDiv = args.divToCompany?.get(divisionId) ?? null;
    if (fromDiv) return fromDiv;
  }
  return args.buToCompany?.get(buId) ?? null;
}