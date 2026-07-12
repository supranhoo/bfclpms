import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

import { buildSeedUpdatePatch } from '@/services/annualReview/annualReviewService';
import { resolveHierarchicalHead, type MgrMap } from '@/lib/annualReview/hierarchyGuard';

describe('Annual Review seed update patch', () => {
  it('resnapshots hierarchy-controlled reviewer columns for existing instances', () => {
    const patch = buildSeedUpdatePatch({
      employee_id: 'emp-1',
      template_id: 'template-new',
      cycle_id: 'cycle-1',
      manager_id: 'mgr-from-master',
      skip_id: 'skip-from-master',
      dept_head_id: 'dept-from-hierarchy-guard',
      bu_head_id: 'bu-from-hierarchy-guard',
      hr_id: 'hr-head',
      assigned_rule_id: 'rule-1',
      enabled_stages: ['self', 'dept_head', 'bu_head'],
    });

    expect(patch).toMatchObject({
      template_id: 'template-new',
      manager_id: 'mgr-from-master',
      skip_id: 'skip-from-master',
      dept_head_id: 'dept-from-hierarchy-guard',
      bu_head_id: 'bu-from-hierarchy-guard',
      hr_id: 'hr-head',
      assigned_rule_id: 'rule-1',
      enabled_stages: ['self', 'dept_head', 'bu_head'],
    });
  });

  it('clears stale dept-head snapshots when the resolved hierarchy has no dept head', () => {
    const patch = buildSeedUpdatePatch({
      employee_id: 'emp-1',
      template_id: 'template-new',
      cycle_id: 'cycle-1',
      manager_id: null,
      skip_id: null,
      dept_head_id: undefined,
      bu_head_id: null,
      hr_id: null,
    });

    expect(patch.dept_head_id).toBeNull();
  });

  // RCA — Akhay Kumar Maity (101796): stale dept_head_id = Sudhir Kumar
  // (101894) after the master hierarchy was corrected. Once we re-run the
  // seeder path against the current master, the patch MUST resolve to the
  // configured department head (Sushanta Ghosh, 101883), never to the stale
  // manager or a peer of the reviewee.
  it('resolves dept_head to the department master, not the previously-stamped manager', () => {
    // Chain: sajid (BU) → prabhat → akhay
    //                            → sudhir (peer of prabhat, WAS wrongly stamped)
    // Department 1050 TPD-Mech head → sushanta (ancestor of akhay via a
    // parallel functional chain — modelled here as an ancestor for the guard).
    const mgrMap: MgrMap = new Map<string, string | null>([
      ['sajid', null],
      ['sushanta', 'sajid'],
      ['prabhat', 'sushanta'],
      ['sudhir', 'sajid'],   // peer branch — must not become dept_head
      ['akhay', 'prabhat'],
    ]);

    const dept = resolveHierarchicalHead({
      employeeId: 'akhay',
      configuredHeadId: 'sushanta',
      fallbackId: 'prabhat',
      mgrMap,
    });
    expect(dept).toEqual({ headId: 'sushanta', usedFallback: false });

    const patch = buildSeedUpdatePatch({
      employee_id: 'akhay',
      template_id: 'template-akhay',
      cycle_id: 'cycle-2026',
      manager_id: 'prabhat',
      skip_id: 'sajid',
      dept_head_id: dept.headId,
      bu_head_id: 'sajid',
      hr_id: 'hr-head',
    });

    expect(patch.manager_id).toBe('prabhat');
    expect(patch.skip_id).toBe('sajid');
    expect(patch.dept_head_id).toBe('sushanta');
    expect(patch.dept_head_id).not.toBe('sudhir'); // never the stale value
  });
});