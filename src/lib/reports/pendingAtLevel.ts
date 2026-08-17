/**
 * ADR-293 / POLICY §RPT-PENDING-AT-LEVEL-CHAIN-SSOT
 *
 * "Pending At Level" for reporting surfaces.
 *
 * Canonical convention: `kpis.status` holds the LAST COMPLETED stage. The stage
 * a KPI is *pending at* is therefore the NEXT stage in the employee's resolved
 * workflow chain (`get_bulk_employee_workflows`, POLICY §105) — never a
 * hardcoded ladder, and never the status label itself.
 *
 * Pure function; tests in `src/test/pendingAtLevel.test.ts`.
 */

export const PENDING_AT_NONE = '—';

export const STAGE_LEVEL_LABEL: Record<string, string> = {
  self_review: 'Employee (Self Review)',
  manager_check: 'Manager',
  functional_manager_check: 'Functional Manager',
  skip_level_check: 'Skip-Level Manager',
  hr_pms_review: 'HR PMS',
  audit: 'Audit',
  management_review: 'Management',
};

/** Stage strictly after `current` in the resolved chain (skipping `approved`). */
function nextStage(chain: string[], current: string): string | null {
  const idx = chain.indexOf(current);
  if (idx === -1) return null;
  for (let i = idx + 1; i < chain.length; i++) {
    const s = chain[i];
    if (s && s !== 'approved') return s;
  }
  return null;
}

export interface ResolvePendingAtLevelInput {
  status: string | null | undefined;
  isOrgKpi: boolean;
  /** Ordered stage chain from get_bulk_employee_workflows. */
  stageChain: string[];
}

export function resolvePendingAtLevel(input: ResolvePendingAtLevelInput): string {
  const { status, isOrgKpi, stageChain } = input;
  if (!status || status === 'approved') return PENDING_AT_NONE;

  // KRA issued but nothing submitted yet: an org KPI waits on its data owner,
  // an individual KPI waits on the employee's self review.
  if (status === 'kra_set') {
    return isOrgKpi ? 'Org KPI Data Owner' : STAGE_LEVEL_LABEL.self_review;
  }

  const next = nextStage(stageChain, status);
  if (!next) return PENDING_AT_NONE;
  return STAGE_LEVEL_LABEL[next] ?? PENDING_AT_NONE;
}
