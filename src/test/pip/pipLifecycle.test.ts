/**
 * ADR-205 / POLICY §PIP-LIFECYCLE-GOVERNANCE
 *
 * Regression coverage for the PIP vocabulary, transition guard (client mirror
 * of `trg_pip_status_transition`) and the PIP candidate rule.
 */
import { describe, it, expect } from 'vitest';
import {
  pipStatusLabel,
  pipOutcomeLabel,
  pipMilestoneLabel,
  isPipTerminal,
  PIP_STATUS_ORDER,
  PIP_OUTCOME_ORDER,
} from '@/lib/pip/pipVocabulary';
import {
  isTransitionAllowed,
  canPerform,
  availableActions,
  type PIPActorContext,
} from '@/lib/pip/pipTransitions';
import { isPipCandidate } from '@/lib/pip/pipCandidateRule';

const MANAGER = 'user-manager';
const HR = 'user-hr';

const initiatorCtx: PIPActorContext = { userId: MANAGER, roles: ['manager'], initiatedBy: MANAGER };
const hrCtx: PIPActorContext = { userId: HR, roles: ['hr_pms'], initiatedBy: MANAGER };
/** Admin who also created the plan — must still not self-approve. */
const adminInitiatorCtx: PIPActorContext = { userId: MANAGER, roles: ['admin'], initiatedBy: MANAGER };

describe('PIP vocabulary (POLICY §13)', () => {
  it('renders the enum value `terminated` as "Cancelled"', () => {
    expect(pipStatusLabel('terminated')).toBe('Cancelled');
  });

  it('maps outcomes to policy wording', () => {
    expect(pipOutcomeLabel('improved')).toBe('Successful');
    expect(pipOutcomeLabel('escalated')).toBe('Partially Successful');
    expect(pipOutcomeLabel('not_improved')).toBe('Unsuccessful');
  });

  it('falls back gracefully on unknown / missing values', () => {
    expect(pipStatusLabel(null)).toBe('—');
    expect(pipOutcomeLabel(undefined)).toBe('—');
    expect(pipMilestoneLabel('weird_value')).toBe('weird_value');
  });

  it('treats completed and cancelled as terminal', () => {
    expect(isPipTerminal('completed')).toBe(true);
    expect(isPipTerminal('terminated')).toBe(true);
    expect(isPipTerminal('active')).toBe(false);
  });

  it('keeps display orders complete', () => {
    expect(PIP_STATUS_ORDER).toHaveLength(6);
    expect(PIP_OUTCOME_ORDER).toHaveLength(3);
  });
});

describe('PIP transition graph', () => {
  it('allows the happy path draft → approval → active → completed', () => {
    expect(isTransitionAllowed('draft', 'pending_hr_approval')).toBe(true);
    expect(isTransitionAllowed('pending_hr_approval', 'active')).toBe(true);
    expect(isTransitionAllowed('active', 'completed')).toBe(true);
  });

  it('blocks skipping approval (draft → active) and draft → completed', () => {
    expect(isTransitionAllowed('draft', 'active')).toBe(false);
    expect(isTransitionAllowed('draft', 'completed')).toBe(false);
  });

  it('locks terminal states', () => {
    expect(isTransitionAllowed('completed', 'active')).toBe(false);
    expect(isTransitionAllowed('terminated', 'draft')).toBe(false);
  });

  it('permits cancellation from every live state', () => {
    for (const s of ['draft', 'pending_hr_approval', 'active', 'extended'] as const) {
      expect(isTransitionAllowed(s, 'terminated')).toBe(true);
    }
  });
});

describe('PIP segregation of duties', () => {
  it('lets the initiator submit but never approve or reject their own plan', () => {
    expect(canPerform('submit_for_approval', 'draft', initiatorCtx)).toBe(true);
    expect(canPerform('approve', 'pending_hr_approval', initiatorCtx)).toBe(false);
    expect(canPerform('reject', 'pending_hr_approval', initiatorCtx)).toBe(false);
  });

  it('blocks self-approval even for an admin initiator', () => {
    expect(canPerform('approve', 'pending_hr_approval', adminInitiatorCtx)).toBe(false);
  });

  it('lets hr_pms approve or reject a plan they did not initiate', () => {
    expect(canPerform('approve', 'pending_hr_approval', hrCtx)).toBe(true);
    expect(canPerform('reject', 'pending_hr_approval', hrCtx)).toBe(true);
  });

  it('offers no actions on a completed plan', () => {
    expect(availableActions('completed', hrCtx)).toEqual([]);
    expect(availableActions('terminated', hrCtx)).toEqual([]);
  });

  it('offers complete/extend/cancel on an active plan', () => {
    expect(availableActions('active', hrCtx).sort()).toEqual(['cancel', 'complete', 'extend']);
  });
});

describe('PIP candidate rule', () => {
  const months = ['2026-04', '2026-05', '2026-06'];

  it('flags an employee below threshold in every month', () => {
    const emp = { monthlyScores: { '2026-04': 40, '2026-05': 55, '2026-06': 51 } };
    expect(isPipCandidate(emp, months, 60)).toBe(true);
  });

  it('does not flag when any month meets the threshold', () => {
    const emp = { monthlyScores: { '2026-04': 40, '2026-05': 61, '2026-06': 51 } };
    expect(isPipCandidate(emp, months, 60)).toBe(false);
  });

  it('does not flag when a month is missing (incomplete picture)', () => {
    const emp = { monthlyScores: { '2026-04': 40, '2026-05': null, '2026-06': 51 } };
    expect(isPipCandidate(emp, months, 60)).toBe(false);
  });

  it('is inert without a configured threshold or range', () => {
    const emp = { monthlyScores: { '2026-04': 10 } };
    expect(isPipCandidate(emp, months, null)).toBe(false);
    expect(isPipCandidate(emp, [], 60)).toBe(false);
  });
});