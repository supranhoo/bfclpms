import { describe, it, expect } from 'vitest';

// v2.66.11.18 (POLICY §125.1) — parity invariant: every employee whose
// resolved workflow contains `hr_pms_review` and who has at least one KPI
// structurally past that stage MUST be addressable by the reviewer-stage
// filter, regardless of how large the org-wide roster is. Prior to the
// `useBulkEmployeeWorkflows` chunking fix, the silent 1000-row PostgREST cap
// dropped workflow entries for any employee past id #1000, causing the
// reviewed-status filter (`stages.indexOf('hr_pms_review') >= 0` then
// `afterHr.includes(status)`) to skip them even though the tile counted
// their KPIs via the score-signature branch.
//
// This test simulates the filter logic against a synthetic 1200-employee
// roster and asserts that the merged workflow map (post-chunking) keeps all
// of them addressable.

type Kpi = { employee_id: string; status: string };

function applyReviewedFilter(
  members: string[],
  kpis: Kpi[],
  workflowMap: Map<string, string[]>,
  defaultStages: string[],
): Set<string> {
  const employeeIds = new Set<string>();
  for (const kpi of kpis) {
    const stages = workflowMap.get(kpi.employee_id) ?? defaultStages;
    const hrIdx = stages.indexOf('hr_pms_review');
    if (hrIdx < 0) continue;
    const afterHr = stages.slice(hrIdx + 1);
    if (afterHr.includes(kpi.status)) employeeIds.add(kpi.employee_id);
  }
  return new Set(members.filter(m => employeeIds.has(m)));
}

describe('HR PMS roster completeness — parity with score-signature tile', () => {
  // Mirrors src/lib/workflowEngine.ts DEFAULT_WORKFLOW_STAGES (no hr_pms_review).
  const DEFAULT_STAGES = [
    'kra_set',
    'self_review',
    'manager_check',
    'audit',
    'management_review',
    'approved',
  ];
  const HR_STAGES = [
    'kra_set',
    'self_review',
    'manager_check',
    'skip_level_check',
    'hr_pms_review',
    'approved',
  ];

  const ids = Array.from({ length: 1200 }, (_, i) =>
    `emp-${String(i).padStart(5, '0')}`,
  );
  const kpis: Kpi[] = ids.map(id => ({ employee_id: id, status: 'approved' }));

  it('regression: with the silent 1000-row cap, ~200 employees are dropped', () => {
    // Simulate pre-fix: only the first 1000 ids have workflow entries.
    const truncatedMap = new Map<string, string[]>();
    ids.slice(0, 1000).forEach(id => truncatedMap.set(id, HR_STAGES));

    const visible = applyReviewedFilter(ids, kpis, truncatedMap, DEFAULT_STAGES);
    expect(visible.size).toBe(1000); // BUG: 200 employees hidden
    expect(visible.has(ids[1100])).toBe(false);
  });

  it('post-fix: chunked workflowMap keeps every employee addressable', () => {
    // Simulate the chunked merge: all 1200 ids resolved.
    const fullMap = new Map<string, string[]>();
    ids.forEach(id => fullMap.set(id, HR_STAGES));

    const visible = applyReviewedFilter(ids, kpis, fullMap, DEFAULT_STAGES);
    expect(visible.size).toBe(1200);
    // Spot-check the previously-hidden tail.
    expect(visible.has(ids[1100])).toBe(true);
    expect(visible.has(ids[1199])).toBe(true);
  });

  it('parity invariant: visible cards ≥ employees with KPI past hr_pms_review', () => {
    const fullMap = new Map<string, string[]>();
    ids.forEach(id => fullMap.set(id, HR_STAGES));

    const visible = applyReviewedFilter(ids, kpis, fullMap, DEFAULT_STAGES);
    const signatureCount = kpis.filter(k => k.status === 'approved').length;
    // Each KPI here belongs to a unique employee, so unique-employee count =
    // signature count. The visible-card set must cover all of them.
    expect(visible.size).toBeGreaterThanOrEqual(
      new Set(kpis.map(k => k.employee_id)).size,
    );
    expect(visible.size).toBe(signatureCount);
  });
});