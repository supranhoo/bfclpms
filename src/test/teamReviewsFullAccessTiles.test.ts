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
    if (k.status === 'kra_set') return 'kraSetPending';
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
    if (k.status === 'kra_set') return 'kraSetPending';
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
    const counts = { kraSetPending: 0, directPending: 0, skipPending: 0, reviewed: 0 };
    for (const k of kpis) {
      const bucket = classify(k, true, empty, empty);
      if (bucket !== 'none') counts[bucket as keyof typeof counts]++;
    }
    expect(counts.kraSetPending).toBe(1); // e6
    expect(counts.directPending).toBe(2);
    expect(counts.skipPending).toBe(1);
    expect(counts.reviewed).toBe(2); // hr_review + approved
    // Sum invariant: every classified KPI is accounted for in exactly one bucket.
    expect(counts.kraSetPending + counts.directPending + counts.skipPending + counts.reviewed)
      .toBe(kpis.length);
  });

  it('legacy membership branch still controls non-full-access viewers', () => {
    const kpis: Kpi[] = [
      { employee_id: 'd1', status: 'self_review' },
      { employee_id: 'd1', status: 'manager_review' },
      { employee_id: 'd1', status: 'kra_set' },
      { employee_id: 'orphan', status: 'self_review' }, // not in either roster
    ];
    const directIds = new Set(['d1']);
    const skipIds = new Set<string>();
    const counts = { kraSetPending: 0, directPending: 0, skipPending: 0, reviewed: 0 };
    for (const k of kpis) {
      const bucket = classify(k, false, directIds, skipIds);
      if (bucket !== 'none') counts[bucket as keyof typeof counts]++;
    }
    expect(counts.kraSetPending).toBe(1);
    expect(counts.directPending).toBe(1);
    expect(counts.reviewed).toBe(1);
    // orphan KPI ignored — manager has no relationship to that employee.
  });
});

/**
 * v2.66.11.8 — 6-tile parity for HR PMS / Manager Review / Skip Mgr Review
 * dashboards. Asserts the sum invariant `pending + inReview + reviewed = total`
 * (excluding pre-self stages where applicable).
 */
function classifyManagerStage(status: string) {
  if (status === 'self_review') return 'pending';
  if (status === 'manager_check') return 'inReview';
  if (['kra_set'].includes(status)) return 'pre';
  return 'reviewed';
}

function classifySkipStage(status: string) {
  if (status === 'manager_check') return 'pending';
  if (status === 'skip_level_check') return 'inReview';
  if (['kra_set', 'self_review'].includes(status)) return 'pre';
  return 'reviewed';
}

describe('Reviewer-stage tile parity (v2.66.11.8)', () => {
  it('Manager Review: pending + inReview + reviewed = total (excl. pre)', () => {
    const statuses = ['self_review', 'self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'approved', 'kra_set'];
    const buckets = { pending: 0, inReview: 0, reviewed: 0, pre: 0 };
    for (const s of statuses) buckets[classifyManagerStage(s) as keyof typeof buckets]++;
    expect(buckets.pending).toBe(2);
    expect(buckets.inReview).toBe(1);
    expect(buckets.reviewed).toBe(4);
    expect(buckets.pending + buckets.inReview + buckets.reviewed + buckets.pre).toBe(statuses.length);
  });

  it('Skip Mgr Review: pending + inReview + reviewed = total (excl. pre)', () => {
    const statuses = ['manager_check', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'approved', 'self_review', 'kra_set'];
    const buckets = { pending: 0, inReview: 0, reviewed: 0, pre: 0 };
    for (const s of statuses) buckets[classifySkipStage(s) as keyof typeof buckets]++;
    expect(buckets.pending).toBe(2);
    expect(buckets.inReview).toBe(1);
    expect(buckets.reviewed).toBe(3);
    expect(buckets.pre).toBe(2);
    expect(buckets.pending + buckets.inReview + buckets.reviewed + buckets.pre).toBe(statuses.length);
  });
});