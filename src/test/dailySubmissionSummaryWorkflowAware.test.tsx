import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DailySubmissionSummary } from '@/components/review/DailySubmissionSummary';
import type { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';

/**
 * POLICY §DAILY-SUBMISSION-WORKFLOW-AWARENESS — the Daily Submission
 * Summary table must render reviewer columns only for stages that exist
 * in the employee's resolved workflow template, in addition to the
 * existing "status has reached stage" gate.
 *
 * Root cause (Jun-2026): the table used a linear STATUS_ORDER chain, so
 * a `self_l1_audit` employee saw Skip-Lvl / HR PMS / Mgmt columns as `—`
 * once status advanced — falsely suggesting unreviewed stages.
 */

function sub(date: string, partial: Partial<SubPeriodSubmission> = {}): SubPeriodSubmission {
  return {
    id: `s-${date}`,
    kpi_id: 'k1',
    sub_period_value: date,
    achieved_value: 5,
    submitted_at: `${date}T06:00:00Z`,
    evidence_urls: [],
    manager_achieved_value: 5,
    auditor_achieved_value: 5,
    management_achieved_value: null,
    admin_achieved_value: null,
    ...partial,
  } as unknown as SubPeriodSubmission;
}

const submissions = [sub('2026-05-01'), sub('2026-05-02')];

function headerLabels(): string[] {
  return Array.from(document.querySelectorAll('thead th')).map(
    (el) => (el.textContent || '').trim(),
  );
}

describe('DailySubmissionSummary — workflow-aware reviewer columns', () => {
  it('self_l1_audit template + status approved → only Self, Manager, Auditor', () => {
    render(
      <DailySubmissionSummary
        kpiId="k1"
        reviewMonth="May"
        reviewYear={2026}
        submissions={submissions}
        kpiStatus="approved"
        workflowStages={[
          'kra_set',
          'self_review',
          'manager_check',
          'audit',
          'approved',
        ]}
      />,
    );
    const labels = headerLabels();
    expect(labels).toContain('Self');
    expect(labels).toContain('Manager');
    expect(labels).toContain('Auditor');
    expect(labels).not.toContain('Skip-Lvl');
    expect(labels).not.toContain('HR PMS');
    expect(labels).not.toContain('Mgmt');
  });

  it('self_hr_pms template + status hr_pms_review → Self, Manager, HR PMS only', () => {
    render(
      <DailySubmissionSummary
        kpiId="k1"
        reviewMonth="May"
        reviewYear={2026}
        submissions={submissions}
        kpiStatus="hr_pms_review"
        workflowStages={[
          'kra_set',
          'self_review',
          'manager_check',
          'hr_pms_review',
          'approved',
        ]}
      />,
    );
    const labels = headerLabels();
    expect(labels).toContain('Self');
    expect(labels).toContain('Manager');
    expect(labels).toContain('HR PMS');
    expect(labels).not.toContain('Auditor');
    expect(labels).not.toContain('Mgmt');
    expect(labels).not.toContain('Skip-Lvl');
  });

  it('full template + status approved → all six reviewer levels render (regression)', () => {
    render(
      <DailySubmissionSummary
        kpiId="k1"
        reviewMonth="May"
        reviewYear={2026}
        submissions={submissions}
        kpiStatus="approved"
        workflowStages={[
          'kra_set',
          'self_review',
          'manager_check',
          'skip_level_check',
          'hr_pms_review',
          'audit',
          'management_review',
          'approved',
        ]}
      />,
    );
    const labels = headerLabels();
    for (const stage of ['Self', 'Manager', 'Skip-Lvl', 'HR PMS', 'Auditor', 'Mgmt']) {
      expect(labels).toContain(stage);
    }
  });

  it('workflowStages omitted → legacy status-only gating (back-compat)', () => {
    render(
      <DailySubmissionSummary
        kpiId="k1"
        reviewMonth="May"
        reviewYear={2026}
        submissions={submissions}
        kpiStatus="approved"
      />,
    );
    const labels = headerLabels();
    // Without a template, the table still surfaces every reached stage.
    for (const stage of ['Self', 'Manager', 'Skip-Lvl', 'HR PMS', 'Auditor', 'Mgmt']) {
      expect(labels).toContain(stage);
    }
  });
});