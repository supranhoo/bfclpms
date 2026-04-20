/**
 * Universal employee active/inactive filter for reports.
 * Single source of truth for filtering logic across all reports.
 */
export type EmployeeStatusMode = 'active' | 'inactive' | 'all';

/**
 * Filter an array of rows by their employee active status.
 * @param rows - Any array of objects
 * @param mode - 'active' | 'inactive' | 'all'
 * @param getIsActive - Extractor that returns the row's is_active flag (or undefined if unknown)
 */
export function applyEmployeeStatusFilter<T>(
  rows: T[],
  mode: EmployeeStatusMode,
  getIsActive: (row: T) => boolean | null | undefined
): T[] {
  if (mode === 'all') return rows;
  return rows.filter((row) => {
    const isActive = getIsActive(row);
    // Treat unknown as active to avoid silent data loss
    const active = isActive !== false;
    return mode === 'active' ? active : !active;
  });
}

/**
 * Human-readable label for the chosen mode (used in Excel header rows).
 */
export function employeeStatusLabel(mode: EmployeeStatusMode): string {
  switch (mode) {
    case 'active': return 'Active employees only';
    case 'inactive': return 'Inactive employees only';
    case 'all': return 'All employees (Active + Inactive)';
  }
}

/**
 * Count helper for footer hints.
 */
export function countByStatus<T>(
  rows: T[],
  getIsActive: (row: T) => boolean | null | undefined
): { active: number; inactive: number; total: number } {
  let active = 0;
  let inactive = 0;
  for (const row of rows) {
    if (getIsActive(row) === false) inactive++;
    else active++;
  }
  return { active, inactive, total: rows.length };
}
