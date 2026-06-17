import { describe, it, expect } from 'vitest';

/**
 * Pure mirror of the SQL `my_review_scope` stage-readiness predicate.
 * The SQL function (see migration 20260617_*) returns a row only when:
 *   - the requested viewer stage exists in the KPI's resolved workflow, AND
 *   - the KPI's current `status` equals the stage immediately preceding the
 *     requested viewer stage (i.e. "last completed stage" convention), AND
 *   - the user is the resolved reviewer at that stage.
 *
 * These tests cover the readiness gate (the SQL change). The "user is
 * resolved reviewer" leg is covered by myReviewScopePredicate.test.ts and
 * the workflow-resolution tests.
 */

type ViewerStage = 'manager' | 'functional_manager' | 'skip_level' | 'auditor' | 'hr_pms' | 'management';

const STAGE_TOKEN: Record<ViewerStage, string> = {
  manager: 'manager_check',
  functional_manager: 'functional_manager_check',
  skip_level: 'skip_level_check',
  auditor: 'audit',
  hr_pms: 'hr_pms_review',
  management: 'management_review',
};

interface KpiRow { kpi_id: string; workflow: string[]; status: string | null }

function isReady(row: KpiRow, viewer: ViewerStage): boolean {
  const token = STAGE_TOKEN[viewer];
  const idx = row.workflow.indexOf(token);
  if (idx < 0) return false;          // stage not in workflow
  if (idx === 0) return false;        // reviewer stages always have a predecessor
  const prev = row.workflow[idx - 1];
  return row.status === prev;
}

const DEFAULT_WF = ['kra_set', 'self_review', 'manager_check', 'audit', 'hr_pms_review', 'management_review', 'approved'];

describe('my_review_scope — stage-readiness gate', () => {
  it('HR PMS sees rows only when status = audit (auditor completed)', () => {
    const ready: KpiRow = { kpi_id: 'k1', workflow: DEFAULT_WF, status: 'audit' };
    const pendingAuditor: KpiRow = { kpi_id: 'k2', workflow: DEFAULT_WF, status: 'manager_check' };
    const pendingSelf: KpiRow = { kpi_id: 'k3', workflow: DEFAULT_WF, status: 'kra_set' };
    expect(isReady(ready, 'hr_pms')).toBe(true);
    expect(isReady(pendingAuditor, 'hr_pms')).toBe(false);
    expect(isReady(pendingSelf, 'hr_pms')).toBe(false);
  });

  it('Auditor does NOT see HR PMS-stage rows (status hr_pms_review)', () => {
    const hrPmsStage: KpiRow = { kpi_id: 'k', workflow: DEFAULT_WF, status: 'hr_pms_review' };
    expect(isReady(hrPmsStage, 'auditor')).toBe(false);
  });

  it('Auditor sees rows only when status = manager_check', () => {
    const ready: KpiRow = { kpi_id: 'k', workflow: DEFAULT_WF, status: 'manager_check' };
    expect(isReady(ready, 'auditor')).toBe(true);
  });

  it('Manager sees rows only when status = self_review', () => {
    const ready: KpiRow = { kpi_id: 'k', workflow: DEFAULT_WF, status: 'self_review' };
    const notReady: KpiRow = { kpi_id: 'k', workflow: DEFAULT_WF, status: 'kra_set' };
    expect(isReady(ready, 'manager')).toBe(true);
    expect(isReady(notReady, 'manager')).toBe(false);
  });

  it('Management sees rows only when status = hr_pms_review', () => {
    const ready: KpiRow = { kpi_id: 'k', workflow: DEFAULT_WF, status: 'hr_pms_review' };
    const notReady: KpiRow = { kpi_id: 'k', workflow: DEFAULT_WF, status: 'audit' };
    expect(isReady(ready, 'management')).toBe(true);
    expect(isReady(notReady, 'management')).toBe(false);
  });

  it('Stage not present in workflow → never ready', () => {
    const wfNoHrPms = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];
    const row: KpiRow = { kpi_id: 'k', workflow: wfNoHrPms, status: 'audit' };
    expect(isReady(row, 'hr_pms')).toBe(false);
  });

  it('Custom workflow skipping audit: HR PMS predecessor = manager_check', () => {
    const wf = ['kra_set', 'self_review', 'manager_check', 'hr_pms_review', 'approved'];
    const ready: KpiRow = { kpi_id: 'k', workflow: wf, status: 'manager_check' };
    const notReady: KpiRow = { kpi_id: 'k', workflow: wf, status: 'self_review' };
    expect(isReady(ready, 'hr_pms')).toBe(true);
    expect(isReady(notReady, 'hr_pms')).toBe(false);
  });

  it('Null status (KRA not set yet) is never ready for a reviewer', () => {
    const row: KpiRow = { kpi_id: 'k', workflow: DEFAULT_WF, status: null };
    expect(isReady(row, 'manager')).toBe(false);
    expect(isReady(row, 'auditor')).toBe(false);
    expect(isReady(row, 'hr_pms')).toBe(false);
  });
});