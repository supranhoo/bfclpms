import { describe, it, expect } from 'vitest';
import { isCarryValueDrifted, describeDrift, round2, type KraDriftSummary } from '@/lib/annualReview/kraDrift';

describe('isCarryValueDrifted', () => {
  it('returns false when stored matches computed at 2dp', () => {
    expect(isCarryValueDrifted(45.55, 45.5501)).toBe(false);
    expect(isCarryValueDrifted(45.55, 45.55)).toBe(false);
  });

  it('returns true when the values differ at 2dp', () => {
    expect(isCarryValueDrifted(45.55, 45.6)).toBe(true);
    expect(isCarryValueDrifted(0, 12.34)).toBe(true);
  });

  it('treats a missing stored snapshot as drift', () => {
    expect(isCarryValueDrifted(null, 12.34)).toBe(true);
    expect(isCarryValueDrifted(undefined, 12.34)).toBe(true);
  });

  it('never reports drift when there is no computed value (no KPI data)', () => {
    expect(isCarryValueDrifted(45.55, null)).toBe(false);
    expect(isCarryValueDrifted(null, undefined)).toBe(false);
    expect(isCarryValueDrifted(45.55, Number.NaN)).toBe(false);
  });

  it('rounds like the DB rehydrate RPC', () => {
    expect(round2(45.554)).toBe(45.55);
    expect(round2(45.555)).toBe(45.56);
  });
});

describe('describeDrift', () => {
  const base: KraDriftSummary = {
    cycle_id: 'c1', kra_instances: 137, in_flight: 1, drifted: 71,
    last_applied_at: null, last_applied_run_id: null, computed_at: '2026-08-03T00:00:00Z',
  };

  it('reports the drifted count', () => {
    expect(describeDrift(base)).toContain('71 of 137');
  });

  it('reports an all-clear', () => {
    expect(describeDrift({ ...base, drifted: 0 })).toContain('in sync');
  });

  it('handles empty and unmeasured cycles', () => {
    expect(describeDrift({ ...base, kra_instances: 0, drifted: 0 })).toContain('No KRA-based reviews');
    expect(describeDrift(null)).toContain('not measured');
  });
});