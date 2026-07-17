import { describe, it, expect } from 'vitest';

/**
 * ADR-108 / POLICY §AR-REVIEWER-SLOT-RESOLUTION — reviewer slot resolver contract.
 *
 * These tests pin the semantics the DB triggers and the
 * `resync_annual_review_reviewer_slots` RPC implement. They are pure so they
 * run in Vitest without a live Postgres.
 */

type Slot = 'manager' | 'skip' | 'dept_head' | 'bu_head' | 'hr';
type Status =
  | 'not_started' | 'pending_self' | 'pending_manager' | 'pending_skip'
  | 'pending_dept' | 'pending_bu' | 'pending_hr' | 'completed' | 'excluded';

const STAGE_KEY: Record<Slot, string> = {
  manager: 'manager',
  skip: 'skip_manager',
  dept_head: 'dept_head',
  bu_head: 'bu_head',
  hr: 'hr',
};

const STILL_OPEN: Record<Slot, Status[]> = {
  manager:  ['not_started','pending_self','pending_manager'],
  skip:     ['not_started','pending_self','pending_manager','pending_skip'],
  dept_head:['not_started','pending_self','pending_manager','pending_skip','pending_dept'],
  bu_head:  ['not_started','pending_self','pending_manager','pending_skip','pending_dept','pending_bu'],
  hr:       ['not_started','pending_self','pending_manager','pending_skip','pending_dept','pending_bu','pending_hr'],
};

function shouldApply(args: {
  slot: Slot;
  status: Status;
  enabledStages: string[];
  actual: string | null;
  expected: string | null;
}): boolean {
  if (args.status === 'excluded' || args.status === 'completed') return false;
  if (!args.enabledStages.includes(STAGE_KEY[args.slot])) return false;
  if (!STILL_OPEN[args.slot].includes(args.status)) return false;
  if (!args.expected) return false;
  return args.actual !== args.expected;
}

describe('AR reviewer slot resync contract', () => {
  it('fills a missing dept_head when stage is enabled and status is pre-dept', () => {
    expect(shouldApply({
      slot: 'dept_head', status: 'pending_self',
      enabledStages: ['self','dept_head','bu_head'],
      actual: null, expected: 'user-A',
    })).toBe(true);
  });

  it('corrects wrong_person for dept_head', () => {
    expect(shouldApply({
      slot: 'dept_head', status: 'pending_self',
      enabledStages: ['self','dept_head','bu_head'],
      actual: 'user-OLD', expected: 'user-NEW',
    })).toBe(true);
  });

  it('does NOT touch a slot whose stage is disabled (17-Jul ghost-slot rule)', () => {
    expect(shouldApply({
      slot: 'manager', status: 'pending_self',
      enabledStages: ['self','dept_head','bu_head'],
      actual: null, expected: 'user-MGR',
    })).toBe(false);
  });

  it('does NOT touch a slot whose stage has already been passed', () => {
    expect(shouldApply({
      slot: 'dept_head', status: 'pending_bu',
      enabledStages: ['self','dept_head','bu_head'],
      actual: 'user-OLD', expected: 'user-NEW',
    })).toBe(false);
  });

  it('does NOT touch completed / excluded rows', () => {
    expect(shouldApply({
      slot: 'dept_head', status: 'completed',
      enabledStages: ['self','dept_head'], actual: null, expected: 'user-A',
    })).toBe(false);
    expect(shouldApply({
      slot: 'dept_head', status: 'excluded',
      enabledStages: ['self','dept_head'], actual: null, expected: 'user-A',
    })).toBe(false);
  });

  it('leaves already-correct rows unchanged (idempotent)', () => {
    expect(shouldApply({
      slot: 'dept_head', status: 'pending_dept',
      enabledStages: ['self','dept_head'], actual: 'user-A', expected: 'user-A',
    })).toBe(false);
  });

  it('is a no-op when the expected head is NULL (orphan_head)', () => {
    expect(shouldApply({
      slot: 'dept_head', status: 'pending_self',
      enabledStages: ['self','dept_head'], actual: null, expected: null,
    })).toBe(false);
  });
});