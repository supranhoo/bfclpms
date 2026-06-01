/**
 * Dummy/System Employee Visibility — pure helper.
 *
 * Mirrors the pattern of `reportEmployeeFilter.ts`. Used by:
 *   • Frontend selectors / lists (when `show_dummy_in_frontend = "no"`)
 *   • Excel exports (when `show_dummy_in_excel = "no"`)
 *
 * `showDummies = true`  → return rows unchanged
 * `showDummies = false` → drop rows whose `getIsDummy` returns true
 *
 * `getIsDummy` returning null/undefined is treated as "not a dummy" so this
 * helper is safe to use against legacy / partially-hydrated row sets where
 * the flag may not have been selected.
 *
 * See POLICY: "Dummy/System Employee Visibility".
 */
export function applyDummyEmployeeFilter<T>(
  rows: T[],
  showDummies: boolean,
  getIsDummy: (row: T) => boolean | null | undefined,
): T[] {
  if (showDummies) return rows;
  return rows.filter((r) => getIsDummy(r) !== true);
}

/**
 * Convenience variant when callers already have a Set<string> of dummy IDs
 * (e.g. `useDummyEmployees().dummyIds`) and rows carry an employee id.
 */
export function filterOutDummyById<T>(
  rows: T[],
  showDummies: boolean,
  dummyIds: Set<string> | null | undefined,
  getEmployeeId: (row: T) => string | null | undefined,
): T[] {
  if (showDummies || !dummyIds || dummyIds.size === 0) return rows;
  return rows.filter((r) => {
    const id = getEmployeeId(r);
    return !id || !dummyIds.has(id);
  });
}