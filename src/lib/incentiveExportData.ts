/**
 * Incentive export data resolver.
 *
 * SSOT for the roster + rates + entries used by Excel/CSV export of incentive
 * programs. Mirrors the on-screen grid (ProductionDailyGrid /
 * ProgramEmployeeMapping) by sourcing the roster from
 * `incentive_program_mappings` and resolving via the same division → BU →
 * department cascade used by `useResolvedProgramEmployees`.
 *
 * Every read uses `fetchAllPaged` to bypass the PostgREST 1,000-row cap,
 * which previously caused Excel exports to render dashes / blank rows for
 * large programs (e.g. Metal Sizing, 2,560+ employees).
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import { fetchProgramMappingsPaged, type ProgramMappingRow } from '@/services/incentiveProgramMappings';

export interface ExportProfile {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
  department_id: string | null;
  pms_grade?: string | null;
  departments?: { name: string | null } | null;
}

export interface ExportRate {
  employee_id: string | null;
  entity_id: string | null;
  rate_per_ton: number;
  rate_type: 'employee' | 'common' | string;
}

export interface ExportDailyEntry {
  employee_id: string;
  daily_values: Record<string, number | string>;
}

export interface ResolvedDailyExport {
  employees: ExportProfile[];
  rates: ExportRate[];
  entries: ExportDailyEntry[];
  daysInMonth: number;
  empRates: Map<string, number>;
  commonRate: number;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Paged profile fetch for an id list, batched to avoid URL length limits.
 *
 * PII-hardening (mem://architecture/profiles-query-policy): direct `.from('profiles')`
 * SELECTs are RLS-scoped, so non-admin users (e.g. managers) get an empty
 * result and the Excel export renders blank rows. We resolve via the
 * SECURITY DEFINER RPC `get_profile_directory_entries_v2` instead, which
 * returns the same shape required by `ExportProfile`.
 */
export async function fetchProfilesByIdsPaged(ids: string[]): Promise<ExportProfile[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return [];
  const out: ExportProfile[] = [];
  for (const batch of chunk(unique, 500)) {
    const { data, error } = await supabase.rpc(
      'get_profile_directory_entries_v2',
      { _ids: batch },
    );
    if (error) throw error;
    for (const r of (data || []) as any[]) {
      out.push({
        id: r.id,
        full_name: r.full_name,
        employee_code: r.employee_code,
        designation: r.designation,
        department_id: r.department_id,
        pms_grade: r.pms_grade,
        departments: r.department_name ? { name: r.department_name } : null,
      });
    }
  }
  return out;
}

/**
 * Resolve mappings → employee ids using the same cascade as
 * useResolvedProgramEmployees (division → BU → department, plus direct
 * employee / designation / pms_grade matches).
 */
export function resolveMappedEmployeeIds(
  mappings: ProgramMappingRow[],
  profiles: ExportProfile[],
  departments: Array<{ id: string; business_unit_id: string | null }>,
  businessUnits: Array<{ id: string; division_id: string | null }>,
): Set<string> {
  const directEmployeeIds = new Set<string>();
  const targetDeptIds = new Set<string>();
  const targetBuIds = new Set<string>();
  const targetDivisionIds = new Set<string>();
  const targetDesignationIds = new Set<string>();
  const targetGrades = new Set<string>();

  for (const m of mappings) {
    switch (m.mapping_type) {
      case 'employee': directEmployeeIds.add(m.mapping_value); break;
      case 'department': targetDeptIds.add(m.mapping_value); break;
      case 'business_unit': targetBuIds.add(m.mapping_value); break;
      case 'division': targetDivisionIds.add(m.mapping_value); break;
      case 'designation': targetDesignationIds.add(m.mapping_value); break;
      case 'pms_grade': targetGrades.add(m.mapping_value); break;
    }
  }

  if (targetDivisionIds.size) {
    for (const bu of businessUnits) {
      if (bu.division_id && targetDivisionIds.has(bu.division_id)) targetBuIds.add(bu.id);
    }
  }
  if (targetBuIds.size) {
    for (const d of departments) {
      if (d.business_unit_id && targetBuIds.has(d.business_unit_id)) targetDeptIds.add(d.id);
    }
  }

  const out = new Set<string>();
  for (const p of profiles) {
    if (directEmployeeIds.has(p.id)) { out.add(p.id); continue; }
    if (p.department_id && targetDeptIds.has(p.department_id)) { out.add(p.id); continue; }
    if (p.designation && targetDesignationIds.has(p.designation)) { out.add(p.id); continue; }
    if ((p as any).pms_grade && targetGrades.has((p as any).pms_grade)) { out.add(p.id); continue; }
  }
  return out;
}

/** Build the lookup of employee-level rates with a common-rate fallback. */
export function buildRateLookup(rates: ExportRate[]): { empRates: Map<string, number>; commonRate: number } {
  const empRates = new Map<string, number>();
  let commonRate = 0;
  for (const r of rates) {
    if (r.rate_type === 'employee' && r.employee_id) empRates.set(r.employee_id, Number(r.rate_per_ton) || 0);
    if (r.rate_type === 'common') commonRate = Number(r.rate_per_ton) || 0;
  }
  return { empRates, commonRate };
}

export function daysIn(month: string, year: number): number {
  const idx = MONTHS.indexOf(month);
  if (idx < 0) return 31;
  return new Date(year, idx + 1, 0).getDate();
}

/**
 * Full resolver for daily-program exports. Returns the roster (matching the
 * grid), rates, entries, and rate-lookup map.
 */
export async function resolveDailyExportData(
  programId: string,
  month: string,
  year: number,
  opts: { filterByCompany?: (employeeId: string) => boolean } = {},
): Promise<ResolvedDailyExport> {
  // 1. Mappings (paged)
  const mappings = await fetchProgramMappingsPaged(programId);

  // 2. Supporting tables for cascade
  const [{ data: departments }, { data: businessUnits }] = await Promise.all([
    supabase.from('departments').select('id, business_unit_id'),
    supabase.from('business_units').select('id, division_id'),
  ]);

  // 3. Active profile universe (paged)
  // PII-hardening: resolve via SECURITY DEFINER RPC so the cascade roster
  // includes employees outside the caller's RLS scope (otherwise non-admin
  // exports collapse to an empty grid).
  const { data: activeData, error: activeErr } = await supabase.rpc(
    'get_active_profile_directory_entries',
  );
  if (activeErr) throw activeErr;
  const allProfiles: ExportProfile[] = ((activeData || []) as any[]).map((r) => ({
    id: r.id,
    full_name: r.full_name,
    employee_code: r.employee_code,
    designation: r.designation,
    department_id: r.department_id,
    pms_grade: r.pms_grade,
    departments: r.department_name ? { name: r.department_name } : null,
  }));

  // 4. Resolve mapping cascade → matched employee ids
  const matchedIds = resolveMappedEmployeeIds(
    mappings,
    allProfiles,
    (departments || []) as any,
    (businessUnits || []) as any,
  );

  // 5. Rates + entries (paged)
  const rates = await fetchAllPaged<ExportRate>((from, to) =>
    supabase
      .from('incentive_production_rates')
      .select('employee_id, entity_id, rate_per_ton, rate_type')
      .eq('program_id', programId)
      .range(from, to) as any,
  );
  const entries = await fetchAllPaged<ExportDailyEntry>((from, to) =>
    supabase
      .from('production_daily_entries')
      .select('employee_id, daily_values')
      .eq('program_id', programId)
      .eq('month', month)
      .eq('year', year)
      .range(from, to) as any,
  );

  // 6. Build roster: matched mapped employees only. Entry-only employees
  //    (saved daily entries whose employee is no longer mapped, or who were
  //    never mapped to begin with) are intentionally excluded so the export
  //    mirrors what the on-screen grid (ProductionDailyGrid) shows. Prior
  //    behavior unioned in every employee with a stored entry which, when a
  //    program had zero mappings (e.g. Metal Sizing for a fresh company),
  //    leaked unrelated employees across companies into the workbook.
  //    RCA 2026-06-26 (Upendra / Bihar Foundry & Casting).
  const allIds = new Set<string>(matchedIds);

  const profileMap = new Map<string, ExportProfile>();
  for (const p of allProfiles) if (allIds.has(p.id)) profileMap.set(p.id, p);

  const missing = Array.from(allIds).filter((id) => !profileMap.has(id));
  if (missing.length) {
    const extra = await fetchProfilesByIdsPaged(missing);
    for (const p of extra) profileMap.set(p.id, p);
  }

  // 7. Apply the same company filter the grid applies, so the export is a
  //    strict subset of the visible roster instead of a cross-company dump.
  const companyFilter = opts.filterByCompany;
  const employees = Array.from(profileMap.values())
    .filter((p) => (companyFilter ? companyFilter(p.id) : true))
    .sort((a, b) =>
    (a.employee_code || '').localeCompare(b.employee_code || ''),
  );

  const { empRates, commonRate } = buildRateLookup(rates);

  return { employees, rates, entries, daysInMonth: daysIn(month, year), empRates, commonRate };
}

export const __internal = { chunk };