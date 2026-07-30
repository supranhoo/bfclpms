/**
 * ADR-205 / POLICY §PIP-LIFECYCLE-GOVERNANCE
 *
 * Client-side mirror of the PL/pgSQL guard `public.pip_transition_allowed()`
 * and `trg_pip_status_transition`. Both definitions MUST stay in lockstep;
 * `src/test/pip/pipTransitions.test.ts` asserts the parity contract.
 *
 * The database is the authority — this module exists only so the UI can hide
 * actions that the server would reject.
 */
import type { PIPStatus } from './pipVocabulary';

export type PIPAction =
  | 'submit_for_approval'
  | 'approve'
  | 'reject'
  | 'extend'
  | 'complete'
  | 'cancel';

/** Legal status graph. Self-transitions (no status change) are always legal. */
export const PIP_TRANSITIONS: Record<PIPStatus, PIPStatus[]> = {
  draft: ['draft', 'pending_hr_approval', 'terminated'],
  pending_hr_approval: ['pending_hr_approval', 'active', 'draft', 'terminated'],
  active: ['active', 'extended', 'completed', 'terminated'],
  extended: ['extended', 'completed', 'terminated'],
  completed: ['completed'],
  terminated: ['terminated'],
};

export function isTransitionAllowed(from: PIPStatus, to: PIPStatus): boolean {
  return (PIP_TRANSITIONS[from] ?? []).includes(to);
}

/** The status an action moves the plan to. */
export const ACTION_TARGET: Record<PIPAction, PIPStatus> = {
  submit_for_approval: 'pending_hr_approval',
  approve: 'active',
  reject: 'draft',
  extend: 'extended',
  complete: 'completed',
  cancel: 'terminated',
};

export interface PIPActorContext {
  /** Signed-in user id. */
  userId: string;
  /** Roles held by the signed-in user. */
  roles: string[];
  /** Who created the plan. */
  initiatedBy: string;
}

/** Roles permitted to act as the HR approver (POLICY §13.1). */
export const PIP_APPROVER_ROLES = ['hr_pms', 'admin', 'management'] as const;

function isApprover(roles: string[]): boolean {
  return roles.some(r => (PIP_APPROVER_ROLES as readonly string[]).includes(r));
}

/**
 * Whether `action` may be offered for a plan in `status` to this actor.
 *
 * Segregation of duties: the initiator may never approve or reject their own
 * plan, even when they also hold an approver role. Enforced server-side by
 * `trg_pip_status_transition`; mirrored here so the buttons never appear.
 */
export function canPerform(
  action: PIPAction,
  status: PIPStatus,
  ctx: PIPActorContext,
): boolean {
  if (!isTransitionAllowed(status, ACTION_TARGET[action])) return false;
  if (status === ACTION_TARGET[action]) return false;

  const isInitiator = ctx.userId === ctx.initiatedBy;
  const approver = isApprover(ctx.roles);
  const isAdmin = ctx.roles.includes('admin');

  switch (action) {
    case 'submit_for_approval':
      return isInitiator || isAdmin;
    case 'approve':
    case 'reject':
      return approver && !isInitiator;
    case 'extend':
    case 'complete':
      return approver || isInitiator;
    case 'cancel':
      return approver || isInitiator;
    default:
      return false;
  }
}

/** All actions currently offerable, in display order. */
export function availableActions(status: PIPStatus, ctx: PIPActorContext): PIPAction[] {
  const order: PIPAction[] = [
    'submit_for_approval',
    'approve',
    'reject',
    'extend',
    'complete',
    'cancel',
  ];
  return order.filter(a => canPerform(a, status, ctx));
}
