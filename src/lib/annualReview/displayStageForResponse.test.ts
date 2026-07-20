import { describe, it, expect } from 'vitest';
import {
  displayStageForResponse,
  groupResponsesByDisplayStage,
  remapStageValueMapByDuplicates,
} from './displayStageForResponse';

const BASE: any = {
  employee_id: 'emp',
  manager_id: 'mgr',
  skip_id: 'skip',
  dept_head_id: 'dept',
  bu_head_id: 'bu',
  hr_id: 'hr',
  enabled_stages: ['self','manager','skip_manager','dept_head','bu_head','hr'],
};

describe('displayStageForResponse', () => {
  it('self never remaps', () => {
    const inst = { ...BASE };
    const r = { reviewer_role: 'self' as const, reviewer_id: 'emp' };
    expect(displayStageForResponse(r, inst, [r])).toBe('self');
  });

  it('Dept≡BU (Prabhu case): response persisted as dept_head displays as bu_head', () => {
    const inst = { ...BASE, dept_head_id: 'shyam', bu_head_id: 'shyam' };
    const self = { reviewer_role: 'self' as const, reviewer_id: 'emp' };
    const dept = { reviewer_role: 'dept_head' as const, reviewer_id: 'shyam' };
    expect(displayStageForResponse(dept, inst, [self, dept])).toBe('bu_head');
  });

  it('does not remap when the higher stage already has its own response', () => {
    const inst = { ...BASE, dept_head_id: 'shyam', bu_head_id: 'shyam' };
    const dept = { reviewer_role: 'dept_head' as const, reviewer_id: 'shyam' };
    const bu   = { reviewer_role: 'bu_head'   as const, reviewer_id: 'shyam' };
    expect(displayStageForResponse(dept, inst, [dept, bu])).toBe('dept_head');
    expect(displayStageForResponse(bu, inst, [dept, bu])).toBe('bu_head');
  });

  it('Manager≡Dept≡BU triple collapse promotes manager response to BU', () => {
    const inst = { ...BASE, manager_id: 'x', dept_head_id: 'x', bu_head_id: 'x' };
    const mgr = { reviewer_role: 'manager' as const, reviewer_id: 'x' };
    expect(displayStageForResponse(mgr, inst, [mgr])).toBe('bu_head');
  });

  it('respects enabled_stages — collapsed higher stage that is disabled is ignored', () => {
    const inst = {
      ...BASE,
      dept_head_id: 'shyam', bu_head_id: 'shyam',
      enabled_stages: ['self','manager','dept_head'] as any,
    };
    const dept = { reviewer_role: 'dept_head' as const, reviewer_id: 'shyam' };
    expect(displayStageForResponse(dept, inst, [dept])).toBe('dept_head');
  });

  it('keeps physical stage when reviewer ids differ', () => {
    const inst = { ...BASE };
    const dept = { reviewer_role: 'dept_head' as const, reviewer_id: 'dept' };
    expect(displayStageForResponse(dept, inst, [dept])).toBe('dept_head');
  });
});

describe('groupResponsesByDisplayStage', () => {
  it('keys responses by display stage', () => {
    const inst = { ...BASE, dept_head_id: 'shyam', bu_head_id: 'shyam' };
    const self = { reviewer_role: 'self' as const, reviewer_id: 'emp', criteria_scores: {} };
    const dept = { reviewer_role: 'dept_head' as const, reviewer_id: 'shyam', criteria_scores: { c1: 4 } };
    const out = groupResponsesByDisplayStage([self, dept], inst);
    expect(out.self).toBe(self);
    expect(out.bu_head).toBe(dept);
    expect(out.dept_head).toBeUndefined();
  });
});

describe('remapStageValueMapByDuplicates', () => {
  it('shifts a lower stage /5 value up to its duplicate higher stage', () => {
    const inst = { ...BASE, dept_head_id: 'shyam', bu_head_id: 'shyam' };
    const out = remapStageValueMapByDuplicates({ self: 4.3, dept_head: 4.0 }, inst);
    expect(out.self).toBe(4.3);
    expect(out.bu_head).toBe(4.0);
    expect(out.dept_head).toBeUndefined();
  });

  it('leaves distinct stages untouched', () => {
    const out = remapStageValueMapByDuplicates(
      { self: 4, manager: 3.5, dept_head: 4, bu_head: 4.5 },
      { ...BASE },
    );
    expect(out).toEqual({ self: 4, manager: 3.5, dept_head: 4, bu_head: 4.5 });
  });
});