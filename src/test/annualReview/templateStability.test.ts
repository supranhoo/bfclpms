import { describe, it, expect } from 'vitest';
import { buildSeedUpdatePatch } from '@/services/annualReview/annualReviewService';

/**
 * ADR-117 — the seed writer's UPDATE patch must NEVER carry `template_id`.
 * Rewriting it on an existing row would clobber a per-employee choice
 * (force-reset or override) with the rule-driven value, which is exactly the
 * drift that made employees keep seeing the old template after HR changed it.
 */
describe('buildSeedUpdatePatch (ADR-117 template stability)', () => {
  const base = {
    employee_id: 'emp-1',
    template_id: 'tpl-rule',
    cycle_id: 'cyc-1',
    manager_id: 'mgr-1',
    skip_id: null,
    bu_head_id: null,
    hr_id: null,
  };

  it('never emits template_id on the update patch', () => {
    const patch = buildSeedUpdatePatch(base);
    expect(patch).not.toHaveProperty('template_id');
    expect(patch).not.toHaveProperty('template_override_id');
  });

  it('still emits the reviewer chain fields the seed is responsible for', () => {
    const patch = buildSeedUpdatePatch({
      ...base,
      dept_head_id: 'dh-1',
      assigned_rule_id: 'rule-1',
      enabled_stages: ['self', 'manager'],
    });
    expect(patch.manager_id).toBe('mgr-1');
    expect(patch.dept_head_id).toBe('dh-1');
    expect(patch.assigned_rule_id).toBe('rule-1');
    expect(patch.enabled_stages).toEqual(['self', 'manager']);
  });
});