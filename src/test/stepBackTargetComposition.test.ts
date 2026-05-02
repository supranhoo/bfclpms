import { describe, expect, it } from 'vitest';
import {
  FULL_STATUS_ORDER,
  computeStepBackTargets,
  getDataAwareDefaultTarget,
  getPreferredStepBackTarget,
} from '@/hooks/useAdminDataEntry';

/**
 * POLICY §117 — Step-Back Target Composition.
 *
 * Regression: Amol Ashok Shivankar's March-2026 KPI was approved with
 * `auditor_score = 0` even though his current workflow template omits the
 * `audit` stage. The Step Back dropdown previously hid Audit Review, leaving
 * the auditor's recorded zero unreachable for correction.
 */
describe('computeStepBackTargets', () => {
  it('includes data-bearing stages even when omitted from the workflow template', () => {
    const workflow = [
      'kra_set',
      'self_review',
      'manager_check',
      'skip_level_check',
      'hr_pms_review',
      'approved',
    ];
    const dataBearing = ['self_review', 'manager_check', 'audit'] as const;

    const targets = computeStepBackTargets('approved', workflow, [...dataBearing]);
    const stages = targets.map((t) => t.stage);

    expect(stages).toContain('audit');
    expect(targets.find((t) => t.stage === 'audit')?.historic).toBe(true);
    expect(targets.find((t) => t.stage === 'manager_check')?.historic).toBe(false);
  });

  it('omits stages that are neither in the workflow nor have data', () => {
    const workflow = ['kra_set', 'self_review', 'manager_check', 'approved'];
    const targets = computeStepBackTargets('approved', workflow, []);
    const stages = targets.map((t) => t.stage);

    expect(stages).not.toContain('hr_pms_review');
    expect(stages).not.toContain('audit');
    expect(stages).not.toContain('management_review');
  });

  it('always includes kra_set as a baseline reset target', () => {
    const targets = computeStepBackTargets('self_review', ['kra_set', 'self_review'], []);
    expect(targets[0]?.stage).toBe('kra_set');
  });

  it('returns canonical FULL_STATUS_ORDER ordering regardless of workflow shape', () => {
    const workflow = ['kra_set', 'self_review', 'hr_pms_review', 'approved'];
    const targets = computeStepBackTargets('approved', workflow, ['audit', 'manager_check']);
    const stages = targets.map((t) => t.stage);

    const orderedIdx = stages.map((s) => FULL_STATUS_ORDER.indexOf(s));
    const sorted = [...orderedIdx].sort((a, b) => a - b);
    expect(orderedIdx).toEqual(sorted);
  });

  it('returns an empty list when there is no stage before current', () => {
    expect(computeStepBackTargets('kra_set', ['kra_set'], [])).toEqual([]);
  });
});

describe('getDataAwareDefaultTarget', () => {
  it('defaults to the immediately-prior data-bearing stage', () => {
    // Approved KPI carries an auditor_score → default target = Audit, not HR PMS.
    const target = getDataAwareDefaultTarget('approved', [
      'self_review',
      'manager_check',
      'audit',
    ]);
    expect(target).toBe('audit');
  });

  it('returns null when no scored stage precedes current', () => {
    expect(getDataAwareDefaultTarget('approved', [])).toBeNull();
    expect(getDataAwareDefaultTarget('kra_set', ['self_review'])).toBeNull();
  });

  it('skips stages that come after current', () => {
    const target = getDataAwareDefaultTarget('manager_check', [
      'self_review',
      'audit', // recorded but logically after manager_check — must be ignored
    ]);
    expect(target).toBe('self_review');
  });
});

describe('getPreferredStepBackTarget (POLICY §117 — Amol March 2026 regression)', () => {
  it('defaults to Audit Review when audit is in the period workflow and has a recorded score', () => {
    // Period-resolved workflow excludes skip-level + HR PMS, includes audit.
    const workflow = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];
    const dataBearing = ['self_review', 'manager_check', 'audit'] as const;
    const targets = computeStepBackTargets('approved', workflow, [...dataBearing]);

    const stages = targets.map(t => t.stage);
    // The dropdown must NOT offer skip_level / hr_pms for this period.
    expect(stages).not.toContain('skip_level_check');
    expect(stages).not.toContain('hr_pms_review');
    // Default selection must land on Audit Review.
    expect(getPreferredStepBackTarget('approved', targets, [...dataBearing])).toBe('audit');
  });

  it('falls back to nearest prior workflow stage when no data-bearing stage qualifies', () => {
    const workflow = ['kra_set', 'self_review', 'manager_check', 'approved'];
    const targets = computeStepBackTargets('approved', workflow, []);
    expect(getPreferredStepBackTarget('approved', targets, [])).toBe('manager_check');
  });

  it('returns kra_set when nothing else is eligible', () => {
    const workflow = ['kra_set', 'self_review'];
    const targets = computeStepBackTargets('self_review', workflow, []);
    expect(getPreferredStepBackTarget('self_review', targets, [])).toBe('kra_set');
  });

  it('never returns a stage that is not in availableTargets', () => {
    const workflow = ['kra_set', 'self_review', 'manager_check', 'approved'];
    const targets = computeStepBackTargets('approved', workflow, []);
    const targetStages = new Set(targets.map(t => t.stage));
    const result = getPreferredStepBackTarget('approved', targets, ['hr_pms_review']);
    expect(result && targetStages.has(result)).toBe(true);
  });
});