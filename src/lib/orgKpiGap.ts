/**
 * Per-row Org-KPI mapping classification for the Bulk Review matrix.
 *
 * Each visible row in the matrix is one (kra_name, kpi_name) tuple rendered
 * across N employee columns. Every employee column maps to a distinct
 * `kpis` row, and that row may or may not carry `is_org_level = true`.
 *
 * Three outcomes per row:
 *   - 'none'  → no employee has this KPI marked as Org KPI.
 *   - 'all'   → every employee has this KPI marked as Org KPI.
 *   - 'gap'   → some employees have it, others don't (inconsistency).
 */
export type OrgKpiRowStatus = 'none' | 'all' | 'gap';

export interface OrgKpiRowInput {
  /** All cells (employee mappings) that belong to this KPI row. */
  kpiIds: ReadonlyArray<string>;
  /** Employee identifier per cell, parallel to `kpiIds` (same length). */
  employeeIds: ReadonlyArray<string>;
  /** Lookup: kpi_id → is_org_level. Missing/false = not org-level. */
  isOrgByKpiId: ReadonlyMap<string, boolean>;
  /** Employee display name lookup for tooltips. */
  employeeNameById?: ReadonlyMap<string, string>;
}

export interface OrgKpiRowResult {
  status: OrgKpiRowStatus;
  mappedCount: number;
  totalCount: number;
  missingEmployeeNames: string[];
}

export function classifyOrgKpiRow(input: OrgKpiRowInput): OrgKpiRowResult {
  const total = input.kpiIds.length;
  if (total === 0) {
    return { status: 'none', mappedCount: 0, totalCount: 0, missingEmployeeNames: [] };
  }
  let mapped = 0;
  const missing: string[] = [];
  for (let i = 0; i < total; i++) {
    const kid = input.kpiIds[i];
    const isOrg = input.isOrgByKpiId.get(kid) === true;
    if (isOrg) {
      mapped++;
    } else {
      const eid = input.employeeIds[i];
      const name = input.employeeNameById?.get(eid) ?? eid;
      missing.push(name);
    }
  }
  if (mapped === 0) return { status: 'none', mappedCount: 0, totalCount: total, missingEmployeeNames: [] };
  if (mapped === total) return { status: 'all', mappedCount: mapped, totalCount: total, missingEmployeeNames: [] };
  return { status: 'gap', mappedCount: mapped, totalCount: total, missingEmployeeNames: missing };
}