/**
 * Pure helper: detect Org-KPI coverage gaps for the current auditor against
 * the rows already in the Bulk Review snapshot.
 *
 * Coverage gap = an Org-level KPI exists in the snapshot for N distinct
 * employees, but the current auditor's assigned scope (employee-level ∪
 * KPI-level) only covers K < N of them. The remaining (N - K) cells are
 * silently hidden by the "My scope only" toggle — that silent hiding is the
 * exact root cause of the "Sindhu Raj Singh / Adherence to Manning Norms"
 * report (June 2026 RCA). Surfacing the gap as a soft alert prevents the
 * auditor from assuming the KPI doesn't exist for the missing employee.
 *
 * No DB calls — operates on the snapshot + scope already in memory.
 */

import type { AuditScopeSets } from './bulkAuditScopeFilter';

export interface CoverageRow {
  kpi_id: string;
  employee_id: string;
  kpi_name: string;
  kra_name: string;
}

export interface OrgKpiCoverageGap {
  /** Stable key = `${kra_name}|${kpi_name}` (Org KPIs are deduped by name). */
  key: string;
  kra_name: string;
  kpi_name: string;
  /** Distinct employees this Org KPI appears for in the loaded snapshot. */
  total: number;
  /** Subset of `total` that falls inside the auditor's assigned scope. */
  covered: number;
  /** Employee ids in `total \ covered`. */
  missingEmpIds: string[];
}

/**
 * @param rows         Loaded snapshot rows (filtered for org-level only).
 * @param orgKpiIds    Set of kpi_id values flagged as Org-level by
 *                     `rpc_kpi_org_flags`. Rows whose kpi_id is NOT in this
 *                     set are ignored — non-org KPIs are 1-to-1 with the
 *                     employee and have no coverage-fanout concept.
 * @param scope        Auditor's assigned scope sets.
 */
export function computeOrgKpiCoverageGaps(
  rows: ReadonlyArray<CoverageRow>,
  orgKpiIds: ReadonlySet<string>,
  scope: AuditScopeSets,
): OrgKpiCoverageGap[] {
  // Group by Org-KPI name (KRA + KPI), collecting unique employee ids.
  const byKey = new Map<string, { kra: string; kpi: string; emps: Set<string>; coveredEmps: Set<string> }>();
  for (const r of rows) {
    if (!orgKpiIds.has(r.kpi_id)) continue;
    const key = `${r.kra_name}|${r.kpi_name}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { kra: r.kra_name, kpi: r.kpi_name, emps: new Set(), coveredEmps: new Set() };
      byKey.set(key, bucket);
    }
    bucket.emps.add(r.employee_id);
    const inScope = scope.kpiIds.has(r.kpi_id) || scope.employeeIds.has(r.employee_id);
    if (inScope) bucket.coveredEmps.add(r.employee_id);
  }

  const gaps: OrgKpiCoverageGap[] = [];
  for (const [key, b] of byKey) {
    const total = b.emps.size;
    const covered = b.coveredEmps.size;
    if (covered < total) {
      const missingEmpIds: string[] = [];
      for (const e of b.emps) if (!b.coveredEmps.has(e)) missingEmpIds.push(e);
      gaps.push({ key, kra_name: b.kra, kpi_name: b.kpi, total, covered, missingEmpIds });
    }
  }
  // Largest gap first (most cells hidden).
  gaps.sort((a, b) => (b.total - b.covered) - (a.total - a.covered));
  return gaps;
}