import { describe, it, expect } from 'vitest';
import {
  buildResolverContext,
  resolveChain,
  type ResolverProfile,
} from '@/lib/workflowResolver';

const STAGES_8 = [
  'kra_set','self_review','manager_check','skip_level_check',
  'hr_pms_review','audit','management_review','approved',
];

function p(over: Partial<ResolverProfile>): ResolverProfile {
  return {
    id: 'x', full_name: 'X', email: 'x@e.com', employee_code: 'X1',
    pms_grade: 'A', department_id: 'd1', reporting_manager_id: null, is_active: true,
    ...over,
  };
}

describe('workflowResolver', () => {
  const emp = p({ id: 'emp', full_name: 'Tanaaz', reporting_manager_id: null });
  const mgr = p({ id: 'mgr', full_name: 'Ravi', reporting_manager_id: null });
  const skip = p({ id: 'skip', full_name: 'Sky', reporting_manager_id: null });
  const hr = p({ id: 'hr', full_name: 'HR User' });

  const empWithMgr = { ...emp, reporting_manager_id: 'mgr' };
  const mgrWithSkip = { ...mgr, reporting_manager_id: 'skip' };
  const mgrSelfLoop = { ...mgr, reporting_manager_id: 'mgr' };

  const baseTpl = {
    templateId: 't1',
    templateName: 'Full 8-stage',
    stages: STAGES_8,
    source: 'default' as const,
  };

  it('returns no_manager_on_profile when employee has no manager', () => {
    const ctx = buildResolverContext([emp], []);
    const r = resolveChain(emp, baseTpl, ctx);
    expect(r.stages.manager.naReason).toBe('no_manager_on_profile');
    expect(r.stages.skip_level.naReason).toBe('no_manager_on_profile');
    expect(r.hasAnyNa).toBe(true);
  });

  it('detects skip-level loop when manager.manager_id == manager.id', () => {
    const ctx = buildResolverContext([empWithMgr, mgrSelfLoop], []);
    const r = resolveChain(empWithMgr, baseTpl, ctx);
    expect(r.stages.manager.users[0].id).toBe('mgr');
    expect(r.stages.skip_level.naReason).toBe('skip_level_loop');
  });

  it('resolves both manager and skip when chain is intact', () => {
    const ctx = buildResolverContext([empWithMgr, mgrWithSkip, skip], []);
    const r = resolveChain(empWithMgr, baseTpl, ctx);
    expect(r.stages.manager.users[0].id).toBe('mgr');
    expect(r.stages.skip_level.users[0].id).toBe('skip');
  });

  it('marks role-pool stages as role_unassigned when no users have the role', () => {
    const ctx = buildResolverContext([empWithMgr, mgrWithSkip, skip], []);
    const r = resolveChain(empWithMgr, baseTpl, ctx);
    expect(r.stages.hr_pms.naReason).toBe('role_unassigned');
    expect(r.stages.auditor.naReason).toBe('role_unassigned');
    expect(r.stages.management.naReason).toBe('role_unassigned');
  });

  it('resolves HR PMS pool from user_roles', () => {
    const ctx = buildResolverContext(
      [empWithMgr, mgrWithSkip, skip, hr],
      [{ user_id: 'hr', role: 'hr_pms' }],
    );
    const r = resolveChain(empWithMgr, baseTpl, ctx);
    expect(r.stages.hr_pms.users[0].id).toBe('hr');
    expect(r.stages.hr_pms.naReason).toBeNull();
  });

  it('marks stage_not_in_template when template omits a stage', () => {
    const ctx = buildResolverContext([empWithMgr, mgrWithSkip, skip], []);
    const tpl = {
      ...baseTpl,
      templateName: 'No skip-level',
      stages: ['kra_set','self_review','manager_check','audit','management_review','approved'],
    };
    const r = resolveChain(empWithMgr, tpl, ctx);
    expect(r.stages.skip_level.inTemplate).toBe(false);
    expect(r.stages.skip_level.naReason).toBe('stage_not_in_template');
    expect(r.stages.manager.inTemplate).toBe(true);
  });

  it('filters inactive users from the pool', () => {
    const inactiveHr = { ...hr, is_active: false };
    const ctx = buildResolverContext(
      [empWithMgr, mgrWithSkip, skip, inactiveHr],
      [{ user_id: 'hr', role: 'hr_pms' }],
    );
    const r = resolveChain(empWithMgr, baseTpl, ctx);
    expect(r.stages.hr_pms.naReason).toBe('role_unassigned');
  });
});
