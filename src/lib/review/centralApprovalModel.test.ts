/**
 * ADR-302 — turn resolution and rail status for the central approval ladder.
 * Mock data covers a 7-step chain mid-ladder, a sent-back row and a finalised row.
 */
import { describe, expect, it } from 'vitest';
import {
  actorMatchesStep, ageingDays, canDecide, canProvide, currentStep, formatAgeing,
  resolveStage, stageSummary, stepStatus,
  type CentralActor, type CentralChainStep, type CentralDecision, type CentralValueRow,
} from './centralApprovalModel';

const step = (
  n: number,
  label: string,
  extra: Partial<CentralChainStep> = {},
): CentralChainStep => ({
  id: `s${n}`,
  step_no: n,
  step_kind: n === 1 ? 'provider' : 'approver',
  label,
  approver_id: null,
  approver_name: null,
  approver_role: null,
  effective_from: '2026-07-01',
  ...extra,
});

const CHAIN: CentralChainStep[] = [
  step(1, 'Data provider', { approver_id: 'provider-1', approver_name: 'Anita' }),
  step(2, 'RM1', { approver_id: 'rm1', approver_name: 'Rakesh' }),
  step(3, 'RM2', { approver_id: 'rm2', approver_name: 'Piyush' }),
  step(4, 'FM1', { approver_role: 'manager' }),
  step(5, 'Dept Head', { approver_id: 'dept-1', approver_name: 'Jyoti' }),
  step(6, 'BU Head', { approver_id: 'bu-1', approver_name: 'Umesh' }),
  step(7, 'HR / Audit', { approver_role: 'hr_pms' }),
];

const baseRow: CentralValueRow = {
  id: 'okv-1',
  achieved_value: 104320,
  target_value: 100000,
  remarks: null,
  is_na: false,
  workflow_stage: 'in_approval',
  current_step: 4,
  submitted_at: '2026-08-15T00:00:00.000Z',
  propagation_mode: 'central_fed',
  sent_back_reason: null,
  sent_back_at: null,
  updated_at: '2026-08-17T00:00:00.000Z',
};

const sentBackRow: CentralValueRow = {
  ...baseRow,
  workflow_stage: 'sent_back',
  current_step: null,
  sent_back_reason: 'Tonnage does not match the sheet',
  sent_back_at: '2026-08-16T00:00:00.000Z',
};

const finalisedRow: CentralValueRow = {
  ...baseRow,
  workflow_stage: 'propagated',
  current_step: null,
};

const TRAIL: CentralDecision[] = [
  { id: 'd0', step_no: 0, step_label: 'Submitted', decision: 'submitted', actor_id: 'provider-1', comment: null, decided_at: '2026-08-15T00:00:00.000Z' },
  { id: 'd1', step_no: 2, step_label: 'RM1', decision: 'approved', actor_id: 'rm1', comment: null, decided_at: '2026-08-16T00:00:00.000Z' },
  { id: 'd2', step_no: 3, step_label: 'RM2', decision: 'approved', actor_id: 'rm2', comment: 'ok', decided_at: '2026-08-17T00:00:00.000Z' },
];

const actor = (over: Partial<CentralActor> = {}): CentralActor => ({
  userId: 'someone',
  roles: [],
  isAdmin: false,
  isDataOwner: false,
  ...over,
});

describe('resolveStage', () => {
  it('treats a NULL workflow_stage as draft', () => {
    expect(resolveStage({ ...baseRow, workflow_stage: null })).toBe('draft');
    expect(resolveStage(null)).toBe('draft');
  });
});

describe('currentStep / actorMatchesStep', () => {
  it('resolves the step the row is sitting on', () => {
    expect(currentStep(CHAIN, baseRow)?.label).toBe('FM1');
  });

  it('returns null when the row is not in approval', () => {
    expect(currentStep(CHAIN, sentBackRow)).toBeNull();
    expect(currentStep(CHAIN, finalisedRow)).toBeNull();
  });

  it('matches a named person', () => {
    expect(actorMatchesStep(CHAIN[1], actor({ userId: 'rm1' }))).toBe(true);
    expect(actorMatchesStep(CHAIN[1], actor({ userId: 'rm2' }))).toBe(false);
  });

  it('matches a role holder', () => {
    expect(actorMatchesStep(CHAIN[3], actor({ roles: ['manager'] }))).toBe(true);
    expect(actorMatchesStep(CHAIN[3], actor({ roles: ['auditor'] }))).toBe(false);
  });
});

describe('canDecide', () => {
  it('only the current step actor may decide', () => {
    expect(canDecide(CHAIN, baseRow, actor({ roles: ['manager'] }))).toBe(true);
    expect(canDecide(CHAIN, baseRow, actor({ userId: 'rm1' }))).toBe(false);
    expect(canDecide(CHAIN, baseRow, actor({ userId: 'bu-1' }))).toBe(false);
  });

  it('admins may decide on the current step', () => {
    expect(canDecide(CHAIN, baseRow, actor({ isAdmin: true }))).toBe(true);
  });

  it('nobody may decide once the row has left approval', () => {
    expect(canDecide(CHAIN, sentBackRow, actor({ isAdmin: true }))).toBe(false);
    expect(canDecide(CHAIN, finalisedRow, actor({ isAdmin: true }))).toBe(false);
  });
});

describe('canProvide', () => {
  it('lets the data owner act on a draft or sent-back row', () => {
    const owner = actor({ isDataOwner: true });
    expect(canProvide({ ...baseRow, workflow_stage: 'draft' }, owner)).toBe(true);
    expect(canProvide(sentBackRow, owner)).toBe(true);
  });

  it('blocks the owner once the row is in approval, but not an admin', () => {
    expect(canProvide(baseRow, actor({ isDataOwner: true }))).toBe(false);
    expect(canProvide(baseRow, actor({ isAdmin: true }))).toBe(true);
  });

  it('blocks anyone who is neither owner nor admin', () => {
    expect(canProvide({ ...baseRow, workflow_stage: 'draft' }, actor())).toBe(false);
  });
});

describe('stepStatus', () => {
  it('marks approved steps done, the current step current and the rest waiting', () => {
    expect(stepStatus(CHAIN[0], baseRow, TRAIL)).toBe('done');
    expect(stepStatus(CHAIN[1], baseRow, TRAIL)).toBe('done');
    expect(stepStatus(CHAIN[3], baseRow, TRAIL)).toBe('current');
    expect(stepStatus(CHAIN[5], baseRow, TRAIL)).toBe('pending');
  });

  it('send-back returns the row to the provider and flags the rejecting step', () => {
    const trail: CentralDecision[] = [
      ...TRAIL,
      { id: 'd3', step_no: 4, step_label: 'FM1', decision: 'sent_back', actor_id: 'fm1', comment: 'Tonnage does not match the sheet', decided_at: '2026-08-16T00:00:00.000Z' },
    ];
    expect(stepStatus(CHAIN[0], sentBackRow, trail)).toBe('current');
    expect(stepStatus(CHAIN[3], sentBackRow, trail)).toBe('sent_back');
  });

  it('marks every step done on a finalised row', () => {
    CHAIN.forEach(s => expect(stepStatus(s, finalisedRow, TRAIL)).toBe('done'));
  });
});

describe('ageing', () => {
  it('counts whole days and never goes negative', () => {
    const now = new Date('2026-08-19T00:00:00.000Z');
    expect(ageingDays('2026-08-17T00:00:00.000Z', now)).toBe(2);
    expect(ageingDays('2026-08-19T06:00:00.000Z', now)).toBe(0);
    expect(ageingDays(null, now)).toBeNull();
  });

  it('formats plural days', () => {
    expect(formatAgeing(0)).toBe('today');
    expect(formatAgeing(1)).toBe('1 day');
    expect(formatAgeing(3)).toBe('3 days');
  });
});

describe('stageSummary', () => {
  it('names the holder while in approval', () => {
    expect(stageSummary(CHAIN, baseRow)).toBe('With Any manager');
    expect(stageSummary(CHAIN, { ...baseRow, current_step: 6 })).toBe('With Umesh');
  });

  it('describes terminal states', () => {
    expect(stageSummary(CHAIN, sentBackRow)).toMatch(/Sent back/);
    expect(stageSummary(CHAIN, finalisedRow)).toMatch(/Propagated/);
    expect(stageSummary(CHAIN, null)).toBe('Not submitted yet');
  });
});
