import { describe, it, expect } from 'vitest';

/**
 * v2.66.10.3 — Regression guard for benign skip-reason classification.
 *
 * Background: The per-scope propagate loop in `OrgKpiDataEntry` buckets
 * each server-returned skip reason into either `totalSkippedBenign` or
 * `totalSkippedHard`. Before this fix only `not_in_kra_set` was treated
 * as benign — so when 34 of 35 employees were already in `manager_check`
 * the RPC returned reason `reviewer_locked`, the bucketing landed in
 * "hard", and a red "Partial propagation … could not be advanced" toast
 * was emitted on every Propagate click for KPIs that had simply moved
 * past the data-owner stage (POLICY §88).
 *
 * Additionally, when the resolver returns 0 target rows for an employee
 * (RLS hidden, name drift, or already advanced), the hook now emits a
 * synthetic `no_target_rows` skip — also benign.
 *
 * Keep this set in sync with the inline `BENIGN` constant in
 * `OrgKpiDataEntry.executeSaveAndPropagate`.
 */
const BENIGN = new Set(['not_in_kra_set', 'reviewer_locked', 'no_target_rows']);

function classify(reason: string): 'benign' | 'hard' {
  return BENIGN.has(reason) ? 'benign' : 'hard';
}

describe('Org KPI propagation skip-reason classification (v2.66.10.3)', () => {
  it('classifies POLICY §88 workflow-locked skips as benign', () => {
    expect(classify('not_in_kra_set')).toBe('benign');
    expect(classify('reviewer_locked')).toBe('benign');
  });

  it('classifies the synthetic empty-resolver skip as benign', () => {
    expect(classify('no_target_rows')).toBe('benign');
  });

  it('keeps genuine race / data-integrity skips classified as hard', () => {
    expect(classify('race_lost_during_advance')).toBe('hard');
    expect(classify('kpi_not_found')).toBe('hard');
    expect(classify('unknown_future_reason')).toBe('hard');
  });
});