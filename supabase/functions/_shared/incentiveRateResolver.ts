/**
 * Deno mirror of src/lib/incentiveRateResolver.ts — kept in sync intentionally.
 * Edge functions cannot import from the React project tree, so this file is the
 * server-side copy. If you edit one, edit BOTH.
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
  effective_from?: string | null;
}

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

export function resolveEmployeeRate(
  employeeId: string,
  departmentId: string | null,
  buId: string | null,
  rates: RateRow[],
  companyId: string | null = null,
  targetDate: string = new Date().toISOString().slice(0, 10),
): ResolvedRate {
  const empRows = rates.filter((r) => r.rate_type === 'employee' && r.employee_id === employeeId);
  const emp = pickLatestEffective(empRows, targetDate);
  if (emp) return { employeeId, rate: Number(emp.rate_per_ton), source: 'employee' };

  if (departmentId) {
    const deptRows = rates.filter((r) => r.rate_type === 'department' && r.entity_id === departmentId);
    const dept = pickLatestEffective(deptRows, targetDate);
    if (dept) return { employeeId, rate: Number(dept.rate_per_ton), source: 'department' };
  }

  if (buId) {
    const buRows = rates.filter((r) => r.rate_type === 'bu' && r.entity_id === buId);
    const bu = pickLatestEffective(buRows, targetDate);
    if (bu) return { employeeId, rate: Number(bu.rate_per_ton), source: 'bu' };
  }

  if (companyId) {
    const compRows = rates.filter((r) => r.rate_type === 'company' && r.entity_id === companyId);
    const comp = pickLatestEffective(compRows, targetDate);
    if (comp) return { employeeId, rate: Number(comp.rate_per_ton), source: 'company' };
  }

  const commonRows = rates.filter((r) => r.rate_type === 'common');
  const common = pickLatestEffective(commonRows, targetDate);
  if (common) return { employeeId, rate: Number(common.rate_per_ton), source: 'common' };

  return { employeeId, rate: 0, source: 'none' };
}

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