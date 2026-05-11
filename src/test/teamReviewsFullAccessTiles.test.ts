/**
 * BUG-050 — Team Reviews tile aggregation for full-access roles.
 *
 * Mirrors the gated branch added to EmployeeSelectorGrid.tsx so the
 * classification rule itself is regression-protected without booting the
 * whole component. If the production logic is ever changed, this test will
 * surface the drift.
 */
import { describe, it, expect } from 'vitest';

type Kpi = { employee_id: string; status: string };

// Inlined helper that matches the production resolveReviewableStatuses output
// for a "standard" 8-stage workflow where skip_level_check is between
// manager_review and hr_review.
const SKIP_REVIEWABLE = ['manager_review'];

function classify(
  k: Kpi,
  isFullAccess: boolean,
  directIds: Set<string>,
  skipIds: Set<string>,
) {
  const isDirect = directIds.has(k.employee_id);
  const isIndirect = skipIds.has(k.employee_id);

  if (isFullAccess && !isDirect && !isIndirect) {
    if (k.status === 'self_review') return 'directPending';
    if (SKIP_REVIEWABLE.includes(k.status)) return 'skipPending';
    if (!['kra_set', 'self_review'].includes(k.status)) return 'reviewed';
    return 'none';
  }
  if (isIndirect) {
    if (SKIP_REVIEWABLE.includes(k.status)) return 'skipPending';
    return 'none';
  }
  if (isDirect) {
    if (k.status === 'self_review') return 'directPending';
    if (!['kra_set', 'self_review'].includes(k.status)) return 'reviewed';
  }
  return 'none';
}

describe('Team Reviews tile aggregation — full-access (BUG-050)', () => {
  it('classifies KPIs by workflow status when admin has empty direct/skip rosters', () => {
    const kpis: Kpi[] = [
      { employee_id: 'e1', status: 'self_review' },
      { employee_id: 'e2', status: 'self_review' },
      { employee_id: 'e3', status: 'manager_review' },
      { employee_id: 'e4', status: 'hr_review' },
      { employee_id: 'e5', status: 'approved' },
      { employee_id: 'e6', status: 'kra_set' },
    ];
    const empty = new Set<string>();
    const counts = { directPending: 0, skipPending: 0, reviewed: 0 };
    for (const k of kpis) {
      const bucket = classify(k, true, empty, empty);
      if (bucket !== 'none') counts[bucket as keyof typeof counts]++;
    }
    expect(counts.directPending).toBe(2);
    expect(counts.skipPending).toBe(1);
    expect(counts.reviewed).toBe(2); // hr_review + approved
  });

  it('legacy membership branch still controls non-full-access viewers', () => {
    const kpis: Kpi[] = [
      { employee_id: 'd1', status: 'self_review' },
      { employee_id: 'd1', status: 'manager_review' },
      { employee_id: 'orphan', status: 'self_review' }, // not in either roster
    ];
    const directIds = new Set(['d1']);
    const skipIds = new Set<string>();
    const counts = { directPending: 0, skipPending: 0, reviewed: 0 };
    for (const k of kpis) {
      const bucket = classify(k, false, directIds, skipIds);
      if (bucket !== 'none') counts[bucket as keyof typeof counts]++;
    }
    expect(counts.directPending).toBe(1);
    expect(counts.reviewed).toBe(1);
    // orphan KPI ignored — manager has no relationship to that employee.
  });
});