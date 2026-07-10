/**
 * Resolve the "Pending With" label for a KPI row on the KPI Scorecard Detail
 * report. Pure function — all inputs are pre-resolved. Regression tests live
 * in `src/test/kpiPendingWith.test.ts`.
 *
 * Rules (per user brief 2026-07-10):
 *   - approved                       → em-dash (nothing pending)
 *   - kra_set + org KPI              → Org KPI Data Owner name(s)
 *   - kra_set + individual KPI       → Employee name (self review is next)
 *   - self_review                    → Reporting Manager name
 *   - manager_check / skip_level_check → next stage per resolved workflow:
 *       skip_level_check → Skip-Level Manager name
 *       audit            → "Audit"
 *       hr_pms_review    → "HR PMS"
 *       management_review→ "Management"
 *   - hr_pms_review / audit / management_review → next queue label, or em-dash
 *   - Anything else / terminal      → em-dash
 *
 * Workflow chain MUST come from `get_bulk_employee_workflows` / `get_employee_workflow`
 * (POLICY §105 / mem: per-employee-workflow-resolution). Never hardcode.
 */

export const PENDING_WITH_NONE = '—';

export type PendingWithStage =
  | 'kra_set'
  | 'self_review'
  | 'manager_check'
  | 'skip_level_check'
  | 'hr_pms_review'
  | 'audit'
  | 'management_review'
  | 'approved'
  | (string & {});

export interface ResolvePendingWithInput {
  status: PendingWithStage | null | undefined;
  isOrgKpi: boolean;
  dataOwnerNames: string; // comma-joined; empty string when none
  employeeName: string;
  managerName: string | null;
  skipManagerName: string | null;
  /** Ordered stage chain from get_employee_workflow (no framing stages). */
  stageChain: string[];
}

const QUEUE_LABEL: Record<string, string> = {
  hr_pms_review: 'HR PMS',
  audit: 'Audit',
  management_review: 'Management',
};

/** Find the stage that comes strictly after `current` in the resolved chain. */
function nextStage(chain: string[], current: string): string | null {
  const idx = chain.indexOf(current);
  if (idx === -1) return null;
  for (let i = idx + 1; i < chain.length; i++) {
    const s = chain[i];
    if (s && s !== 'approved') return s;
  }
  return null;
}

function labelForNext(
  next: string | null,
  managerName: string | null,
  skipManagerName: string | null,
): string {
  if (!next) return PENDING_WITH_NONE;
  if (next === 'manager_check') return managerName || PENDING_WITH_NONE;
  if (next === 'skip_level_check') return skipManagerName || PENDING_WITH_NONE;
  return QUEUE_LABEL[next] || PENDING_WITH_NONE;
}

export function resolvePendingWith(input: ResolvePendingWithInput): string {
  const {
    status,
    isOrgKpi,
    dataOwnerNames,
    employeeName,
    managerName,
    skipManagerName,
    stageChain,
  } = input;

  if (!status || status === 'approved') return PENDING_WITH_NONE;

  if (status === 'kra_set') {
    if (isOrgKpi) return dataOwnerNames?.trim() || PENDING_WITH_NONE;
    return employeeName || PENDING_WITH_NONE;
  }

  if (status === 'self_review') {
    return managerName || PENDING_WITH_NONE;
  }

  // For every reviewer stage, look up the next stage from the resolved chain.
  if (
    status === 'manager_check' ||
    status === 'skip_level_check' ||
    status === 'hr_pms_review' ||
    status === 'audit' ||
    status === 'management_review'
  ) {
    const next = nextStage(stageChain, status);
    return labelForNext(next, managerName, skipManagerName);
  }

  return PENDING_WITH_NONE;
}