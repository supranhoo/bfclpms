/**
 * Workflow Resolver — Single Source of Truth for "who reviews this employee
 * at each workflow stage in a given month/year".
 *
 * The Workflow Resolution Report and the Workflow Configuration export both
 * call this helper, so a row can never disagree with itself across surfaces.
 *
 * The resolver does NOT re-implement template selection — that is delegated
 * to the existing DB function `get_employee_workflow_info`. This module only
 * adds the per-stage USER chain on top of the resolved template.
 */

export type ChainStage =
  | 'self'
  | 'manager'
  | 'skip_level'
  | 'hr_pms'
  | 'auditor'
  | 'management';

export const CHAIN_STAGES: ChainStage[] = [
  'self',
  'manager',
  'skip_level',
  'hr_pms',
  'auditor',
  'management',
];

export const CHAIN_STAGE_LABEL: Record<ChainStage, string> = {
  self: 'Self',
  manager: 'L1 Manager',
  skip_level: 'Skip-Level',
  hr_pms: 'HR PMS',
  auditor: 'Auditor',
  management: 'Management',
};

/** Workflow stage name -> chain stage key. Mirrors `getVisibleJourneyStages`. */
const STAGE_TO_CHAIN: Record<string, ChainStage> = {
  self_review: 'self',
  manager_check: 'manager',
  skip_level_check: 'skip_level',
  hr_pms_review: 'hr_pms',
  audit: 'auditor',
  management_review: 'management',
};

export type NaReason =
  | 'stage_not_in_template'
  | 'no_manager_on_profile'
  | 'skip_level_loop'
  | 'resolved_user_inactive'
  | 'role_unassigned';

export const NA_REASON_LABEL: Record<NaReason, string> = {
  stage_not_in_template: 'Stage not in template',
  no_manager_on_profile: 'No manager_id on profile',
  skip_level_loop: 'Skip-level = manager (loop)',
  resolved_user_inactive: 'Resolved user inactive',
  role_unassigned: 'Stage role unassigned',
};

export interface ResolverProfile {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
  pms_grade: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
  is_active: boolean;
}

export interface ResolvedStage {
  stage: ChainStage;
  /** True when the workflow template includes this stage. */
  inTemplate: boolean;
  /** Resolved users (1+ for HR PMS / Auditor / Management role pools). */
  users: ResolverProfile[];
  naReason: NaReason | null;
}

export interface ResolvedChain {
  employee: ResolverProfile;
  templateId: string | null;
  templateName: string | null;
  templateStages: string[];
  source: 'employee' | 'department' | 'pms_grade' | 'default' | 'unknown';
  stages: Record<ChainStage, ResolvedStage>;
  hasAnyNa: boolean;
}

export interface ResolverContext {
  /** All ACTIVE profiles in the org, indexed by id. */
  profilesById: Map<string, ResolverProfile>;
  /** Active user ids per app_role. */
  usersByRole: Map<string, ResolverProfile[]>;
}

function resolveStageUser(
  stage: ChainStage,
  employee: ResolverProfile,
  inTemplate: boolean,
  ctx: ResolverContext,
): { users: ResolverProfile[]; naReason: NaReason | null } {
  if (!inTemplate) {
    return { users: [], naReason: 'stage_not_in_template' };
  }

  switch (stage) {
    case 'self':
      return { users: [employee], naReason: null };

    case 'manager': {
      if (!employee.reporting_manager_id) {
        return { users: [], naReason: 'no_manager_on_profile' };
      }
      const m = ctx.profilesById.get(employee.reporting_manager_id);
      if (!m) return { users: [], naReason: 'resolved_user_inactive' };
      return { users: [m], naReason: null };
    }

    case 'skip_level': {
      const mgrId = employee.reporting_manager_id;
      if (!mgrId) return { users: [], naReason: 'no_manager_on_profile' };
      const mgr = ctx.profilesById.get(mgrId);
      if (!mgr) return { users: [], naReason: 'resolved_user_inactive' };
      const skipId = mgr.reporting_manager_id;
      if (!skipId) return { users: [], naReason: 'no_manager_on_profile' };
      if (skipId === mgrId || skipId === employee.id) {
        return { users: [], naReason: 'skip_level_loop' };
      }
      const skip = ctx.profilesById.get(skipId);
      if (!skip) return { users: [], naReason: 'resolved_user_inactive' };
      return { users: [skip], naReason: null };
    }

    case 'hr_pms':
    case 'auditor':
    case 'management': {
      const role = stage === 'auditor' ? 'auditor' : stage;
      const pool = ctx.usersByRole.get(role) || [];
      if (pool.length === 0) {
        return { users: [], naReason: 'role_unassigned' };
      }
      return { users: pool, naReason: null };
    }
  }
}

export function resolveChain(
  employee: ResolverProfile,
  templateInfo: {
    templateId: string | null;
    templateName: string | null;
    stages: string[];
    source: ResolvedChain['source'];
  },
  ctx: ResolverContext,
): ResolvedChain {
  const stageSet = new Set(templateInfo.stages);
  const stages = {} as Record<ChainStage, ResolvedStage>;
  let hasAnyNa = false;

  for (const chain of CHAIN_STAGES) {
    // Find the workflow stage name that maps to this chain stage
    const wfStage = Object.keys(STAGE_TO_CHAIN).find(
      (k) => STAGE_TO_CHAIN[k] === chain,
    );
    const inTemplate = wfStage ? stageSet.has(wfStage) : false;
    const { users, naReason } = resolveStageUser(chain, employee, inTemplate, ctx);
    stages[chain] = { stage: chain, inTemplate, users, naReason };
    if (naReason) hasAnyNa = true;
  }

  return {
    employee,
    templateId: templateInfo.templateId,
    templateName: templateInfo.templateName,
    templateStages: templateInfo.stages,
    source: templateInfo.source,
    stages,
    hasAnyNa,
  };
}

export function buildResolverContext(
  profiles: ResolverProfile[],
  roleRows: { user_id: string; role: string }[],
): ResolverContext {
  const activeProfiles = profiles.filter((p) => p.is_active);
  const profilesById = new Map(activeProfiles.map((p) => [p.id, p]));

  const usersByRole = new Map<string, ResolverProfile[]>();
  for (const r of roleRows) {
    const p = profilesById.get(r.user_id);
    if (!p) continue; // Inactive users are filtered out per Core memory.
    const arr = usersByRole.get(r.role) || [];
    arr.push(p);
    usersByRole.set(r.role, arr);
  }
  return { profilesById, usersByRole };
}
