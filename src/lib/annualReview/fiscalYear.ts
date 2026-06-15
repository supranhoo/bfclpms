/**
 * Annual Review fiscal-year SSOT.
 *
 * BFCL convention (per `mem://architecture/pms/fiscal-year-cycle`):
 *   - Fiscal cycle runs July → June.
 *   - A cycle's `review_year` is the END year of that fiscal cycle
 *     (e.g. cycle "Annual Review - 2025-2026" has `review_year = 2026`).
 *   - `fyStart` (used by `carryKraScore` and any time-series math) is
 *     the START year = July (e.g. fyStart = 2025 → July 2025 → June 2026).
 *
 * Always derive fyStart through this helper so the off-by-one cannot drift
 * across surfaces (employee form, reviewer form, HR finalization, reports).
 */

/** Max KPI rating scale used in `review_submissions.{final,auditor,manager,self}_score`. */
export const KPI_SCALE_MAX = 5;

export function fyStartFromCycle(
  cycle: { review_year: number } | null | undefined,
): number {
  if (!cycle || typeof cycle.review_year !== 'number') {
    // Fall back to current Indian fiscal year start. Callers should always
    // supply a cycle, but keep this defensive so we never crash a render.
    const now = new Date();
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  }
  return cycle.review_year - 1;
}

/** Human-readable FY label, e.g. `FY 2025-26`. */
export function fyLabel(fyStart: number): string {
  const end = (fyStart + 1) % 100;
  return `FY ${fyStart}-${end.toString().padStart(2, '0')}`;
}