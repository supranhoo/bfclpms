import {
  resolveTemplateForProfile,
  type MappingProfile,
} from '@/services/annualReview/formMapping';
import type { AnnualReviewAssignmentRule } from '@/types/annualReview';

/**
 * Effective template state seeded on an `annual_review_instances` row.
 * Precedence at render time is `template_override_id > template_id`.
 */
export interface SeededInstance {
  template_id: string | null;
  template_override_id: string | null;
}

export interface EligibleAudienceInput {
  profiles: MappingProfile[];
  rules: Pick<
    AnnualReviewAssignmentRule,
    'id' | 'template_id' | 'filters' | 'is_active' | 'priority'
  >[];
  deptToBu: Record<string, string | null>;
  krasSets: Map<number, Set<string>> | null;
  seededByEmp: Map<string, SeededInstance>;
  templateIds: string[];
}

/**
 * Union of employees whose EFFECTIVE template for a cycle either:
 *   a) is already seeded to one of `templateIds` (via override or template),
 *      OR
 *   b) would be assigned to one of `templateIds` by the active mapping rules
 *      (i.e. the seeder would pick that template on the next run).
 *
 * Used by the Phased Rollout preview so admins can add employees to a phase
 * BEFORE any instance exists for the cycle. Previously the filter only
 * intersected with seeded instances, silently hiding the pre-seed
 * population.
 */
export function resolveEligibleEmployeeIdsForTemplates(
  input: EligibleAudienceInput,
): Set<string> {
  const out = new Set<string>();
  if (input.templateIds.length === 0) return out;
  const wanted = new Set(input.templateIds);
  for (const p of input.profiles) {
    const seeded = input.seededByEmp.get(p.id);
    const seededEff = seeded
      ? seeded.template_override_id ?? seeded.template_id
      : null;
    let resolved: string | null = seededEff;
    if (!resolved) {
      const pred = resolveTemplateForProfile(
        input.rules,
        p,
        input.deptToBu,
        input.krasSets,
      );
      resolved = pred.templateId;
    }
    if (resolved && wanted.has(resolved)) out.add(p.id);
  }
  return out;
}