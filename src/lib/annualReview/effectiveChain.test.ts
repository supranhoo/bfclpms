import { describe, it, expect } from 'vitest';
import { resolveEffectiveChain, effectiveStages } from './effectiveChain';

const ENABLED = ['self','manager','skip_manager','dept_head','bu_head','hr'] as const;
const EMP = 'emp-1';
const JASPAL = 'jaspal';
const HR = 'hr-x';
const SKIP = 'skip-y';
const active = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, true]));

describe('resolveEffectiveChain — duplicate reviewer de-dup', () => {
  it('keeps the highest tier and skips lower duplicates (Ankit / Jaspal case)', () => {
    const rows = resolveEffectiveChain({
      enabledStages: [...ENABLED],
      employeeId: EMP,
      reviewers: { manager: JASPAL, skip_manager: SKIP, dept_head: JASPAL, bu_head: JASPAL, hr: HR },
      activeById: active(JASPAL, SKIP, HR),
    });
    const byStage = Object.fromEntries(rows.map((r) => [r.stage, r]));
    expect(byStage.manager.skipped).toBe(true);
    expect(byStage.manager.skipReason).toBe('duplicate_reviewer');
    expect(byStage.manager.duplicateOf).toBe('bu_head');
    expect(byStage.dept_head.skipped).toBe(true);
    expect(byStage.dept_head.duplicateOf).toBe('bu_head');
    expect(byStage.bu_head.skipped).toBe(false);
    expect(effectiveStages({
      enabledStages: [...ENABLED], employeeId: EMP,
      reviewers: { manager: JASPAL, skip_manager: SKIP, dept_head: JASPAL, bu_head: JASPAL, hr: HR },
      activeById: active(JASPAL, SKIP, HR),
    })).toEqual(['self','skip_manager','bu_head','hr']);
  });

  it('keeps manager when only dept+bu collide', () => {
    const stages = effectiveStages({
      enabledStages: [...ENABLED], employeeId: EMP,
      reviewers: { manager: 'mgr', skip_manager: SKIP, dept_head: JASPAL, bu_head: JASPAL, hr: HR },
      activeById: active('mgr', SKIP, JASPAL, HR),
    });
    expect(stages).toEqual(['self','manager','skip_manager','bu_head','hr']);
  });

  it('self_assignment wins over duplicate_reviewer', () => {
    const rows = resolveEffectiveChain({
      enabledStages: [...ENABLED], employeeId: EMP,
      reviewers: { manager: 'mgr', skip_manager: SKIP, dept_head: EMP, bu_head: EMP, hr: HR },
      activeById: active('mgr', SKIP, EMP, HR),
    });
    const bu = rows.find((r) => r.stage === 'bu_head')!;
    const dept = rows.find((r) => r.stage === 'dept_head')!;
    expect(bu.skipReason).toBe('self_assignment');
    expect(dept.skipReason).toBe('self_assignment');
  });

  it('null / inactive checks run before dedup', () => {
    const rows = resolveEffectiveChain({
      enabledStages: [...ENABLED], employeeId: EMP,
      reviewers: { manager: JASPAL, skip_manager: null, dept_head: 'inactive-1', bu_head: JASPAL, hr: HR },
      activeById: { ...active(JASPAL, HR), 'inactive-1': false },
    });
    const byStage = Object.fromEntries(rows.map((r) => [r.stage, r]));
    expect(byStage.skip_manager.skipReason).toBe('no_reviewer_mapped');
    expect(byStage.dept_head.skipReason).toBe('reviewer_inactive');
    expect(byStage.bu_head.skipped).toBe(false);
    expect(byStage.manager.skipReason).toBe('duplicate_reviewer');
  });

  it('self is always kept and never marked duplicate', () => {
    const rows = resolveEffectiveChain({
      enabledStages: ['self','manager'], employeeId: EMP,
      reviewers: { manager: 'mgr' },
      activeById: active('mgr'),
    });
    expect(rows[0]).toMatchObject({ stage: 'self', skipped: false, reviewerId: EMP });
  });
});