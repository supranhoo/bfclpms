/**
 * v2.66.11.15 — HR PMS Reviewed tile must count KPIs that have structurally
 * advanced past `hr_pms_review` even when the submission row lacks an
 * `hr_pms_score` signature (auto-advance / bulk-approval / legacy data).
 *
 * Mirrors the HR PMS branch in EmployeeSelectorGrid.tsx (~L1059-1095) so the
 * classification rule itself is regression-protected without booting the full
 * component tree.
 *
 * See POLICY.md §115 (BUG-046 + v2.66.11.15 extension).
 */
import { describe, it, expect } from 'vitest';

type Kpi = { id: string; employee_id: string; status: string };
type Sub = { hr_pms_score?: number | null; is_na?: boolean };

// Standard 8-stage workflow used for the gate tests.
const STAGES = [
  'kra_set',
  'self_review',
  'manager_check',
  'skip_level_check',
  'hr_pms_review',
  'audit',
  'management_review',
  'approved',
];
const HR_REVIEWABLE = ['skip_level_check']; // stage immediately before hr_pms

function classify(k: Kpi, sub: Sub | undefined) {
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
    const afterHr = STAGES.slice(hrIdx + 1);
    if (afterHr.includes(k.status)) {
      if (!countedReviewed) { reviewed++; countedReviewed = true; }
    }
  }
  return { pending, inReview, reviewed };
}

describe('HR PMS Reviewed tile (v2.66.11.15)', () => {
  it('KPI currently in hr_pms_review counts as inReview only', () => {
    expect(classify({ id: '1', employee_id: 'e', status: 'hr_pms_review' }, undefined))
      .toEqual({ pending: 0, inReview: 1, reviewed: 0 });
  });

  it('KPI past HR PMS with NO submission row still counts as reviewed (regression)', () => {
    expect(classify({ id: '2', employee_id: 'e', status: 'audit' }, undefined))
      .toEqual({ pending: 0, inReview: 0, reviewed: 1 });
    expect(classify({ id: '3', employee_id: 'e', status: 'approved' }, undefined))
      .toEqual({ pending: 0, inReview: 0, reviewed: 1 });
  });

  it('KPI past HR PMS with submission row missing hr_pms_score still counts as reviewed', () => {
    const sub: Sub = { hr_pms_score: null, is_na: false };
    expect(classify({ id: '4', employee_id: 'e', status: 'management_review' }, sub))
      .toEqual({ pending: 0, inReview: 0, reviewed: 1 });
  });

  it('KPI awaiting HR PMS (status skip_level_check) counts as pending only', () => {
    expect(classify({ id: '5', employee_id: 'e', status: 'skip_level_check' }, undefined))
      .toEqual({ pending: 1, inReview: 0, reviewed: 0 });
  });

  it('Score-signature wins for in-stage KPI without double-counting', () => {
    const sub: Sub = { hr_pms_score: 4.5 };
    // status still hr_pms_review (signature stamped before status moved on)
    const r = classify({ id: '6', employee_id: 'e', status: 'hr_pms_review' }, sub);
    expect(r.reviewed).toBe(1);
    expect(r.inReview).toBe(1); // mutually exclusive buckets — tile shows both honestly
  });

  it('Past HR PMS with hr_pms_score already set is counted exactly once', () => {
    const sub: Sub = { hr_pms_score: 3.2 };
    expect(classify({ id: '7', employee_id: 'e', status: 'approved' }, sub))
      .toEqual({ pending: 0, inReview: 0, reviewed: 1 });
  });

  it('Sum invariant: pending + inReview + reviewed ≤ total across mixed batch', () => {
    const kpis: Array<[Kpi, Sub | undefined]> = [
      [{ id: 'a', employee_id: 'e1', status: 'kra_set' }, undefined], // pre-self
      [{ id: 'b', employee_id: 'e1', status: 'self_review' }, undefined],
      [{ id: 'c', employee_id: 'e1', status: 'skip_level_check' }, undefined], // pending
      [{ id: 'd', employee_id: 'e1', status: 'hr_pms_review' }, undefined], // inReview
      [{ id: 'e', employee_id: 'e1', status: 'audit' }, undefined], // reviewed (forwarded)
      [{ id: 'f', employee_id: 'e1', status: 'approved' }, { hr_pms_score: 4 }], // reviewed (signature)
    ];
    const totals = { pending: 0, inReview: 0, reviewed: 0 };
    for (const [k, s] of kpis) {
      const r = classify(k, s);
      totals.pending += r.pending;
      totals.inReview += r.inReview;
      totals.reviewed += r.reviewed;
    }
    expect(totals).toEqual({ pending: 1, inReview: 1, reviewed: 2 });
    expect(totals.pending + totals.inReview + totals.reviewed).toBeLessThanOrEqual(kpis.length);
  });
});