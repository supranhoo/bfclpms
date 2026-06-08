/**
 * Pure predicates for the Bulk Review "My audit scope only" toggle and the
 * multi-category client filter. Extracted out of the dashboard so they're
 * independently testable without mounting the page.
 */

export interface AuditScopeSets {
  employeeIds: ReadonlySet<string>;
  kpiIds: ReadonlySet<string>;
}

export interface RowForScope {
  kpi_id: string;
  employee_id: string;
  category_id: string | null;
}

/** True when the row is assigned to the current auditor (by KPI or employee). */
export function isRowInAuditorScope(
  row: Pick<RowForScope, 'kpi_id' | 'employee_id'>,
  scope: AuditScopeSets,
): boolean {
  return scope.kpiIds.has(row.kpi_id) || scope.employeeIds.has(row.employee_id);
}

/** True when the row's category is in the selected category set (or none selected). */
export function matchesCategoryFilter(
  row: Pick<RowForScope, 'category_id'>,
  selected: ReadonlyArray<string>,
): boolean {
  if (selected.length === 0) return true;
  if (!row.category_id) return false;
  return selected.includes(row.category_id);
}