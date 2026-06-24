import type { AnnualReviewerRole } from '@/types/annualReview';
import type { SafetyProfileLite } from '@/hooks/useSafetyOrg';
import { formatSafetyProfileLabel } from '@/hooks/useSafetyOrg';

interface InstanceLike {
  employee_id: string;
  manager_id: string | null;
  skip_id: string | null;
  dept_head_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
}

/**
 * Builds the `reviewerNamesByStage` map consumed by `AnnualReviewStageTracker`.
 * Looks each stage's mapped user id up against the already-cached active
 * profiles list and formats it via `formatSafetyProfileLabel`. Returns `null`
 * (renders "— Unassigned") for stages whose slot is empty.
 */
export function buildReviewerNamesByStage(
  instance: InstanceLike,
  profiles: SafetyProfileLite[] | undefined,
): Partial<Record<AnnualReviewerRole, string | null>> {
  const byId = new Map<string, SafetyProfileLite>();
  (profiles ?? []).forEach((p) => byId.set(p.id, p));
  const label = (id: string | null) => (id ? formatSafetyProfileLabel(byId.get(id) ?? { id, full_name: null, email: null, employee_code: null }) : null);
  return {
    self:         label(instance.employee_id),
    manager:      label(instance.manager_id),
    skip_manager: label(instance.skip_id),
    dept_head:    label(instance.dept_head_id),
    bu_head:      label(instance.bu_head_id),
    hr:           label(instance.hr_id),
  };
}