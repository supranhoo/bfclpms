import { describe, it, expect } from 'vitest';
import { isRowInMyReviewScope } from '@/lib/bulkAuditScopeFilter';

/**
 * Regression tests for the v2.66.38 fix to the admin "role-ready" filter
 * on Bulk Review (POLICY §111.7.t):
 *
 *   1. When the role-ready scope is still loading or has errored, the
 *      filter MUST be fail-closed — i.e. no rows are actionable. Previously
 *      the filter was a no-op while data was missing, which let an admin
 *      sign-off upstream rows (e.g. Anil Pathak 200301 / May 2026 5S KPI
 *      with status=self_review) AS HR PMS.
 *
 *   2. Selections made while the filter was OFF must be pruned to the
 *      currently visible/actionable row set when the filter is turned ON or
 *      the viewer stage changes. Sticky selection is the leak path that
 *      put the Anil row into the 90-cell bulk dialog despite the toggle.
 */

interface Row { kpi_id: string; employee_id: string; submission_id: string | null }

function applyAdminFilter(
  rows: Row[],
  filterOn: boolean,
  pairs: ReadonlySet<string> | null,
): Row[] {
  if (!filterOn) return rows;
  // Fail-closed: missing pair set ⇒ empty actionable set.
  const safe = pairs ?? new Set<string>();
  return rows.filter(r => isRowInMyReviewScope(r, safe));
}

function pruneSelection(
  selectedIds: Set<string>,
  visibleRows: Row[],
): Set<string> {
  const visible = new Set<string>();
  for (const r of visibleRows) if (r.submission_id) visible.add(r.submission_id);
  const next = new Set<string>();
  selectedIds.forEach(id => { if (visible.has(id)) next.add(id); });
  return next;
}

const ROWS: Row[] = [
  // Anil Pathak (200301) 5S — status=self_review, HR PMS upstream
  { kpi_id: 'kpi-5s', employee_id: 'e-anil', submission_id: 'sub-anil' },
  // HR PMS-ready row (status=audit, predecessor complete)
  { kpi_id: 'kpi-5s', employee_id: 'e-ready', submission_id: 'sub-ready' },
];
const HR_READY_PAIRS = new Set<string>(['kpi-5s|e-ready']);

describe('Admin role-ready filter — fail-closed + selection pruning', () => {
  it('filter OFF: every row is visible (QA mode)', () => {
    expect(applyAdminFilter(ROWS, false, HR_READY_PAIRS)).toHaveLength(2);
  });

  it('filter ON with data: only ready rows are actionable', () => {
    const out = applyAdminFilter(ROWS, true, HR_READY_PAIRS);
    expect(out.map(r => r.submission_id)).toEqual(['sub-ready']);
  });

  it('filter ON but scope NULL (loading): fail-closed — zero rows', () => {
    expect(applyAdminFilter(ROWS, true, null)).toHaveLength(0);
  });

  it('filter ON but scope EMPTY (errored / nothing ready): zero rows', () => {
    expect(applyAdminFilter(ROWS, true, new Set())).toHaveLength(0);
  });

  it('REGRESSION: Anil row never leaks into HR PMS actionable view', () => {
    const out = applyAdminFilter(ROWS, true, HR_READY_PAIRS);
    expect(out.some(r => r.employee_id === 'e-anil')).toBe(false);
  });

  it('selection made in QA mode is pruned when filter is turned ON', () => {
    // Admin selected both rows while filter was OFF.
    let selected = new Set<string>(['sub-anil', 'sub-ready']);
    // Now toggles filter ON: visible set shrinks to ready rows only.
    const visible = applyAdminFilter(ROWS, true, HR_READY_PAIRS);
    selected = pruneSelection(selected, visible);
    expect(Array.from(selected)).toEqual(['sub-ready']);
  });

  it('selection is fully cleared if filter ON and nothing is ready', () => {
    let selected = new Set<string>(['sub-anil', 'sub-ready']);
    const visible = applyAdminFilter(ROWS, true, new Set());
    selected = pruneSelection(selected, visible);
    expect(selected.size).toBe(0);
  });

  it('selection is preserved if all selected rows remain visible', () => {
    let selected = new Set<string>(['sub-ready']);
    const visible = applyAdminFilter(ROWS, true, HR_READY_PAIRS);
    selected = pruneSelection(selected, visible);
    expect(Array.from(selected)).toEqual(['sub-ready']);
  });
});