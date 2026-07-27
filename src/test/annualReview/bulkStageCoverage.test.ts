import { describe, it, expect } from 'vitest';
import {
  classifyStageCoverage,
  summariseSkipsByStatus,
  isMidWorkflow,
  MID_WORKFLOW_STATUSES,
} from '@/lib/annualReview/bulkStageCoverage';

/**
 * ADR-186 / POLICY §AR-SYSTEM-SLOT-COVERAGE.
 * RCA: 100508 + 101676 sat at pending_dept / pending_bu during the 25-Jul bulk
 * production upload and were silently dropped as "Locked stage: …", leaving a
 * weighted System KPI slot empty (scored 0 of weight 25).
 */
describe('bulk upload stage coverage', () => {
  it('writes directly to early stages', () => {
    for (const s of ['not_started', 'pending_self', 'pending_manager']) {
      expect(classifyStageCoverage(s)).toEqual({ mode: 'safe' });
    }
  });

  it('skips completed unless the admin opts in, then upgrades', () => {
    expect(classifyStageCoverage('completed').mode).toBe('skip');
    expect(classifyStageCoverage('completed', { allowCompletedUpgrades: true }).mode)
      .toBe('admin_upgrade');
  });

  it.each([...MID_WORKFLOW_STATUSES])('names %s explicitly when skipped', (status) => {
    const d = classifyStageCoverage(status);
    expect(d.mode).toBe('skip');
    // Regression: the reason must identify the cohort, never a generic label.
    expect(d.reason).toContain(status);
    expect(d.reason).toMatch(/Mid-workflow/i);
  });

  it('covers mid-workflow rows through the monotonic upgrade path when opted in', () => {
    expect(classifyStageCoverage('pending_bu', { allowMidWorkflowUpgrades: true }).mode)
      .toBe('admin_upgrade');
    expect(classifyStageCoverage('pending_dept', { allowMidWorkflowUpgrades: true }).mode)
      .toBe('admin_upgrade');
  });

  it('does not treat the completed opt-in as mid-workflow coverage (the 25-Jul gap)', () => {
    expect(classifyStageCoverage('pending_bu', { allowCompletedUpgrades: true }).mode)
      .toBe('skip');
  });

  it('never writes to excluded or unknown stages', () => {
    for (const s of ['excluded', 'acknowledged', 'whatever']) {
      expect(classifyStageCoverage(s, {
        allowCompletedUpgrades: true, allowMidWorkflowUpgrades: true,
      }).mode).toBe('skip');
      expect(isMidWorkflow(s)).toBe(false);
    }
  });

  it('groups skips by stage so a cohort cannot hide behind one number', () => {
    const rows = [
      { verdict: 'skip', stageStatus: 'pending_bu' },
      { verdict: 'skip', stageStatus: 'pending_bu' },
      { verdict: 'skip', stageStatus: 'completed' },
      { verdict: 'apply', stageStatus: 'pending_self' },
      { verdict: 'skip' },
    ];
    expect(summariseSkipsByStatus(rows)).toEqual([
      { status: 'pending_bu', count: 2 },
      { status: 'completed', count: 1 },
      { status: 'unknown', count: 1 },
    ]);
  });
});
