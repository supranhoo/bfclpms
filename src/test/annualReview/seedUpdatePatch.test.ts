import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {},
}));

import { buildSeedUpdatePatch } from '@/services/annualReview/annualReviewService';

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
});