/**
 * ADR-206 — the Functional Manager must get an editable scorecard on the
 * stage that precedes `functional_manager_check`.
 */
import { describe, it, expect } from 'vitest';
import { canReviewKpi } from '@/lib/workflowEngine';

const F1 = ['kra_set', 'self_review', 'manager_check', 'functional_manager_check', 'audit', 'approved'];

describe('Functional Manager review action path', () => {
  it('can act while the KPI sits at the stage before functional_manager_check', () => {
    expect(canReviewKpi('manager_check', 'functional-manager-review', F1)).toBe(true);
  });

  it('cannot act once the FM stage is signed off', () => {
    expect(canReviewKpi('functional_manager_check', 'functional-manager-review', F1)).toBe(false);
  });

  it('cannot act on a workflow without the FM stage', () => {
    expect(canReviewKpi('manager_check', 'functional-manager-review', ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'])).toBe(false);
  });

  it('does not let the L1 manager view act on an FM-pending KPI', () => {
    expect(canReviewKpi('manager_check', 'team-review', F1)).toBe(false);
  });
});
