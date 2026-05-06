/**
 * Single source of truth for Org KPI count semantics (ADR-064).
 *
 * Three different surfaces (card badge, expanded scoped table, impact sheet)
 * historically derived counts independently and ended up disagreeing on the
 * same KPI. This helper enforces one contract:
 *
 *  - mappedCount: canonical number of employees mapped to this KPI for the
 *    selected period, derived from `mappedEmpIdsByKey` in the
 *    useOrgLevelKpisWithEmployees hook (already filtered to is_active=true).
 *  - visibleCount: how many of those rows the current user can actually
 *    render — i.e. `scopedRows.length` after RLS-based profile filtering.
 *  - hiddenCount: mappedCount - visibleCount, never negative.
 *  - enteredCount: rows where the user supplied a value or marked N/A.
 *
 * Surfaces should display `mappedCount` as the "X employees" total
 * everywhere, and only fall back to `visibleCount` when no mapping snapshot
 * is available. When mappedCount > visibleCount, the existing amber
 * visibility-mismatch banner explains the gap (ADR-060).
 */

export interface OrgKpiCountInputs {
  mappedEmployeeIds?: ReadonlyArray<string> | ReadonlySet<string> | null;
  visibleRows?: ReadonlyArray<unknown> | null;
  enteredPredicate?: (row: any) => boolean;
}

export interface OrgKpiCountResult {
  mappedCount: number;
  visibleCount: number;
  hiddenCount: number;
  enteredCount: number;
}

function sizeOf(x: ReadonlyArray<string> | ReadonlySet<string> | null | undefined): number {
  if (!x) return 0;
  return Array.isArray(x) ? x.length : (x as ReadonlySet<string>).size;
}

export function deriveOrgKpiCounts(input: OrgKpiCountInputs): OrgKpiCountResult {
  const mappedCount = sizeOf(input.mappedEmployeeIds);
  const visibleCount = input.visibleRows?.length ?? 0;
  // Mapped count is canonical; if it's missing, fall back to what we can see.
  const effectiveMapped = mappedCount > 0 ? mappedCount : visibleCount;
  const hiddenCount = Math.max(0, effectiveMapped - visibleCount);
  const enteredCount = input.enteredPredicate && input.visibleRows
    ? input.visibleRows.filter(input.enteredPredicate).length
    : 0;
  return { mappedCount: effectiveMapped, visibleCount, hiddenCount, enteredCount };
}

/**
 * Build a stable signature of a scopedRows array so React reset effects can
 * detect when the upstream snapshot has actually changed (e.g. switching
 * months changes the row count from 50 to 55 even though the KPI identity
 * is unchanged). Avoids depending on `data.scopedRows` reference identity,
 * which is unstable across renders.
 */
export function scopedRowsSignature(rows: ReadonlyArray<{ scopeId: string }> | null | undefined): string {
  if (!rows || rows.length === 0) return '0:';
  // Length first for fast reject, then sorted ids for stability.
  const ids = rows.map(r => r.scopeId).sort();
  return `${rows.length}:${ids.join(',')}`;
}
