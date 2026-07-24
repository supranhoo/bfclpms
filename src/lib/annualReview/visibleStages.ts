import { resolveEffectiveChain, effectiveStages, type StageResolution } from './effectiveChain';
import type { AnnualReviewerRole } from '@/types/annualReview';

interface InstanceLike {
  employee_id: string;
  manager_id: string | null;
  skip_id: string | null;
  dept_head_id: string | null;
  bu_head_id: string | null;
  hr_id: string | null;
  management_id?: string | null;
  enabled_stages: AnnualReviewerRole[];
}

interface ProfileLike { id: string }

/**
 * Computes the **stages the workflow engine will actually execute** for an
 * instance, given the active-profiles list. Auto-skipped stages
 * (no reviewer mapped / self-assignment / inactive reviewer / duplicate
 * reviewer) are dropped so the stepper matches engine behaviour.
 *
 * Returns `null` while `profiles` is still loading — callers should fall
 * back to `instance.enabled_stages` so the stepper doesn't flicker empty.
 */
export function computeVisibleStages(
  instance: InstanceLike,
  profiles: ProfileLike[] | undefined | null,
): AnnualReviewerRole[] | null {
  if (!profiles) return null;
  const activeById: Record<string, boolean> = {};
  for (const p of profiles) activeById[p.id] = true;
  return effectiveStages({
    enabledStages: instance.enabled_stages,
    employeeId: instance.employee_id,
    reviewers: {
      manager: instance.manager_id,
      skip_manager: instance.skip_id,
      dept_head: instance.dept_head_id,
      bu_head: instance.bu_head_id,
      hr: instance.hr_id,
      management: instance.management_id ?? null,
    },
    activeById,
  });
}

/** Same inputs as {@link computeVisibleStages} but returns the full resolution rows. */
export function computeStageResolutions(
  instance: InstanceLike,
  profiles: ProfileLike[] | undefined | null,
): StageResolution[] | null {
  if (!profiles) return null;
  const activeById: Record<string, boolean> = {};
  for (const p of profiles) activeById[p.id] = true;
  return resolveEffectiveChain({
    enabledStages: instance.enabled_stages,
    employeeId: instance.employee_id,
    reviewers: {
      manager: instance.manager_id,
      skip_manager: instance.skip_id,
      dept_head: instance.dept_head_id,
      bu_head: instance.bu_head_id,
      hr: instance.hr_id,
      management: instance.management_id ?? null,
    },
    activeById,
  });
}