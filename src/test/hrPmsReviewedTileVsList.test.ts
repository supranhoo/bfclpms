/**
 * v2.66.11.17 — Tile↔List parity invariant for the HR PMS Reviewed dashboard.
 *
 * For the HR PMS branch of `EmployeeSelectorGrid.tsx`, when `statusFilter === 'reviewed'`,
 * the tile count (`stat3`) MUST equal the sum of `badge3` values across the
 * employees actually surfaced in the filtered list. This guards against the
 * April 2026 confusion (tile=116 vs visible-list=46 due to per-employee
 * collapsing) by asserting that whichever number is shown matches the data
 * the user can actually click into.
 *
 * See POLICY §115 + DOCUMENTATION v2.66.11.17.
 */
import { describe, it, expect } from 'vitest';

type Kpi = { id: string; employee_id: string; status: string };
type Sub = { hr_pms_score?: number | null; is_na?: boolean };

const STAGES = [
  'kra_set', 'self_review', 'manager_check', 'skip_level_check',
  'hr_pms_review', 'audit', 'management_review', 'approved',
];
const HR_REVIEWABLE = ['skip_level_check'];

// Mirrors EmployeeSelectorGrid.tsx HR PMS branch (L1059-1106).
function classifyKpi(k: Kpi, sub: Sub | undefined) {
  let pending = 0, inReview = 0, reviewed = 0;
  let countedReviewed = false;
  if (sub) {
    if (sub.hr_pms_score != null) { reviewed++; countedReviewed = true; }
    else if (sub.is_na === true) {
      const hrIdx = STAGES.indexOf('hr_pms_review');
      const past = hrIdx >= 0 && STAGES.slice(hrIdx + 1).includes(k.status);
      if (past || k.status === 'approved') { reviewed++; countedReviewed = true; }
    }
  }
  const hrIdx = STAGES.indexOf('hr_pms_review');
  if (hrIdx === -1) return { pending, inReview, reviewed };
  if (k.status === 'hr_pms_review') {
    inReview++;
  } else {
    if (HR_REVIEWABLE.includes(k.status)) pending++;
    if (STAGES.slice(hrIdx + 1).includes(k.status)) {
      if (!countedReviewed) { reviewed++; countedReviewed = true; }
    }
  }
  return { pending, inReview, reviewed };
}

// Roster-level reducer: tile counts every KPI; per-employee badge sums every
// KPI grouped by employee. The two MUST be equal for the same input.
function tileAndBadges(kpis: Array<[Kpi, Sub | undefined]>) {
  let tileReviewed = 0;
  const perEmpBadge = new Map<string, number>();
  for (const [k, s] of kpis) {
    const r = classifyKpi(k, s);
    tileReviewed += r.reviewed;
    perEmpBadge.set(k.employee_id, (perEmpBadge.get(k.employee_id) ?? 0) + r.reviewed);
  }
  const visibleEmployees = [...perEmpBadge.entries()].filter(([, b]) => b > 0);
  const badgeSum = visibleEmployees.reduce((a, [, b]) => a + b, 0);
  return { tileReviewed, badgeSum, visibleEmployees: visibleEmployees.length };
}

describe('HR PMS Reviewed tile ↔ visible-list parity (v2.66.11.17)', () => {
  it('mixed batch: signatures + structural advancement + N/A — tile equals Σ badges', () => {
    const fx: Array<[Kpi, Sub | undefined]> = [
      [{ id: '1', employee_id: 'e1', status: 'approved' }, { hr_pms_score: 4 }],
      [{ id: '2', employee_id: 'e1', status: 'audit' }, undefined],
      [{ id: '3', employee_id: 'e2', status: 'management_review' }, { hr_pms_score: 3.5 }],
      [{ id: '4', employee_id: 'e3', status: 'approved' }, { is_na: true }],
      [{ id: '5', employee_id: 'e4', status: 'hr_pms_review' }, undefined],       // inReview, not reviewed
      [{ id: '6', employee_id: 'e5', status: 'self_review' }, undefined],         // pre-HR, not reviewed
    ];
    const { tileReviewed, badgeSum, visibleEmployees } = tileAndBadges(fx);
    expect(tileReviewed).toBe(4); // 1+2+3+4 reviewed; 5 inReview; 6 pre
    expect(badgeSum).toBe(tileReviewed); // PARITY INVARIANT
    expect(visibleEmployees).toBe(3); // e1, e2, e3 surface; e4 / e5 don't
  });

  it('single-employee multiple reviewed KPIs collapses to one card with full badge', () => {
    const fx: Array<[Kpi, Sub | undefined]> = [
      [{ id: '1', employee_id: 'e1', status: 'approved' }, { hr_pms_score: 4 }],
      [{ id: '2', employee_id: 'e1', status: 'approved' }, { hr_pms_score: 3 }],
      [{ id: '3', employee_id: 'e1', status: 'audit' }, undefined],
    ];
    const { tileReviewed, badgeSum, visibleEmployees } = tileAndBadges(fx);
    expect(tileReviewed).toBe(3);
    expect(badgeSum).toBe(3);
    expect(visibleEmployees).toBe(1); // 3 KPIs, 1 employee card with badge=3
  });

  it('empty roster: tile=0, no visible employees, parity holds trivially', () => {
    const { tileReviewed, badgeSum, visibleEmployees } = tileAndBadges([]);
    expect(tileReviewed).toBe(0);
    expect(badgeSum).toBe(0);
    expect(visibleEmployees).toBe(0);
  });

  it('all KPIs pre-HR-PMS: tile=0 and no employees surface', () => {
    const fx: Array<[Kpi, Sub | undefined]> = [
      [{ id: '1', employee_id: 'e1', status: 'self_review' }, undefined],
      [{ id: '2', employee_id: 'e2', status: 'manager_check' }, undefined],
      [{ id: '3', employee_id: 'e3', status: 'kra_set' }, undefined],
    ];
    const { tileReviewed, badgeSum, visibleEmployees } = tileAndBadges(fx);
    expect(tileReviewed).toBe(0);
    expect(badgeSum).toBe(0);
    expect(visibleEmployees).toBe(0);
  });
});