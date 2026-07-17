import { describe, it, expect } from 'vitest';
import { resolveSelfAchievedValue } from '@/lib/review/resolveSelfAchievedValue';

// CAPA-2026-07 / §88.6 / ADR-106 regression: when a self-owning writer
// (e.g. legacy Admin Data Entry rows before the mirror patch) updated
// achieved_value + self_score without mirroring self_achieved_value, the
// resolver must NOT return the stale snapshot. It should prefer whichever
// column recomputes to the frozen self_score.
describe('resolveSelfAchievedValue — stale snapshot guard', () => {
  const kpi = {
    r5: 60, r4: 55, r3: 50, r2: 45, r1: 40, r0: null,
    target_value: 60,
    criteria: 'Higher is Better',
    uom: 'days',
    uom_type: 'numeric',
    qualitative_options: null,
    threshold_mode: 'absolute' as const,
  };

  it('returns the fresh achieved_value when the frozen snapshot is stale but achieved_value matches self_score', () => {
    const submission = {
      achieved_value: 65,
      self_achieved_value: 38, // stale — pre-CAPA legacy row
      self_score: 5,
    };
    const result = resolveSelfAchievedValue(submission as any, kpi as any);
    expect(result.value).toBe(65);
    expect(result.source).toBe('recovered');
  });

  it('still returns the snapshot when it recomputes to self_score (pristine path)', () => {
    const submission = {
      achieved_value: 65,
      self_achieved_value: 65,
      self_score: 5,
    };
    const result = resolveSelfAchievedValue(submission as any, kpi as any);
    expect(result.value).toBe(65);
    expect(result.source).toBe('pristine');
  });

  it('falls through to recovery logic when neither column matches self_score', () => {
    // Snapshot 38 (rating 0), shared 45 (rating 2), self_score 5 → both
    // stale; reverse-derive from thresholds. Only 60 (r5) rates 5.
    const submission = {
      achieved_value: 45,
      self_achieved_value: 38,
      self_score: 5,
      manager_achieved_value: 45, // force reviewer-stage-written branch
    };
    const result = resolveSelfAchievedValue(submission as any, kpi as any);
    expect(result.value).toBe(60);
    expect(result.source).toBe('recovered');
  });
});
