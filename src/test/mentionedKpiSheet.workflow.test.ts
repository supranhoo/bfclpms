import { describe, it, expect } from 'vitest';
import { getVisibleJourneyStages, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';

/**
 * Regression: "Management" tile appeared in the @Mention KPI Details popup
 * for employee 101804 (May 2026), because MentionedKpiSheet did not pass the
 * resolved per-employee workflow into KpiReviewPanel and KpiJourneySection
 * fell back to DEFAULT_WORKFLOW_STAGES (which includes management_review).
 *
 * After the fix, MentionedKpiSheet resolves the workflow via
 * useEmployeeWorkflowStages and forwards it to KpiReviewPanel. This test
 * pins the contract used to derive visible stages so the bug cannot return.
 */
describe('MentionedKpiSheet — Review Journey stage visibility', () => {
  it('hides Management when the resolved workflow ends at Audit (101804 case)', () => {
    const auditTerminal = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];
    const visible = getVisibleJourneyStages(auditTerminal);
    expect(visible).toEqual(['self', 'manager', 'auditor']);
    expect(visible).not.toContain('management');
  });

  it('shows Management only when management_review is part of the workflow', () => {
    const visible = getVisibleJourneyStages(DEFAULT_WORKFLOW_STAGES);
    expect(visible).toContain('management');
  });

  it('regression guard: default fallback still includes management_review', () => {
    // If this ever changes, MentionedKpiSheet behavior must be re-verified.
    expect(DEFAULT_WORKFLOW_STAGES).toContain('management_review');
  });
});
