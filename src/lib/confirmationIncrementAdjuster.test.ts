import { describe, it, expect } from 'vitest';
import {
  adjustConfirmationIncrement,
  type AdjusterInput,
  statusToTransition,
} from './confirmationIncrementAdjuster';

function base(over: Partial<AdjusterInput> = {}): AdjusterInput {
  return {
    doj: '2024-12-01',
    confirmationDate: '2025-12-01',
    confirmationIncrementGranted: true,
    confirmationIncrementEffectiveDate: '2025-12-01',
    assessmentCycleStart: '2025-07-01',
    assessmentCycleEnd: '2026-07-01', // exclusive end-of-cycle
    naiveEligibleMonths: 12,
    rule: { treatment: 'adjust_covered_period' },
    ...over,
  };
}

describe('adjustConfirmationIncrement', () => {
  it('Scenario 1: AY 2025-26 — Dec 2025 confirmation increment leaves 6m balance', () => {
    const r = adjustConfirmationIncrement(base());
    // Dec-2025 → Jul-2026 = 7 months covered; balance = 12 - 7 = 5
    expect(r.treatmentApplied).toBe('adjust_covered_period');
    expect(r.periodCoveredMonths).toBe(7);
    expect(r.finalEligibleMonths).toBe(5);
  });

  it('Scenario 1 (variant): cycle covers Jan-Jun = 6 months balance when effective Jan-1', () => {
    const r = adjustConfirmationIncrement(
      base({ confirmationIncrementEffectiveDate: '2026-01-01' }),
    );
    // Jan-2026 → Jul-2026 = 6 months covered → balance = 6
    expect(r.periodCoveredMonths).toBe(6);
    expect(r.finalEligibleMonths).toBe(6);
  });

  it('Scenario 2 (Option B): shift_next_cycle → 0 months this AY', () => {
    const r = adjustConfirmationIncrement(
      base({ rule: { treatment: 'shift_next_cycle' } }),
    );
    expect(r.finalEligibleMonths).toBe(0);
    expect(r.treatmentApplied).toBe('shift_next_cycle');
  });

  it('Scenario 1 next-AY (Jul-2027): 12 month cycle + 6m carry-forward = 18', () => {
    const r = adjustConfirmationIncrement({
      doj: '2024-12-01',
      confirmationDate: '2025-12-01',
      confirmationIncrementGranted: true,
      confirmationIncrementEffectiveDate: '2025-12-01', // before this cycle
      assessmentCycleStart: '2026-07-01',
      assessmentCycleEnd: '2027-07-01',
      naiveEligibleMonths: 12,
      previousCycleUncoveredMonths: 6,
      rule: { treatment: 'carry_forward_uncovered' },
    });
    expect(r.periodCoveredMonths).toBe(0); // effective before cycle start
    expect(r.balanceEligibleMonths).toBe(12);
    expect(r.carryForwardMonths).toBe(6);
    expect(r.finalEligibleMonths).toBe(18);
  });

  it('Scenario 3: Mar-2026 confirmation, AY 2025-26 → 4 months covered, 8 balance', () => {
    const r = adjustConfirmationIncrement({
      doj: '2025-03-01',
      confirmationDate: '2026-03-01',
      confirmationIncrementGranted: true,
      confirmationIncrementEffectiveDate: '2026-03-01',
      assessmentCycleStart: '2025-07-01',
      assessmentCycleEnd: '2026-07-01',
      naiveEligibleMonths: 12,
      rule: { treatment: 'adjust_covered_period' },
    });
    // Mar-2026 → Jul-2026 = 4 months covered → balance = 8
    expect(r.periodCoveredMonths).toBe(4);
    expect(r.finalEligibleMonths).toBe(8);
  });

  it('Scenario 3 next-AY (Jul-2027): 12m + 3m carry-forward = 15', () => {
    const r = adjustConfirmationIncrement({
      doj: '2025-03-01',
      confirmationDate: '2026-03-01',
      confirmationIncrementGranted: true,
      confirmationIncrementEffectiveDate: '2026-03-01',
      assessmentCycleStart: '2026-07-01',
      assessmentCycleEnd: '2027-07-01',
      naiveEligibleMonths: 12,
      previousCycleUncoveredMonths: 3,
      rule: { treatment: 'carry_forward_uncovered' },
    });
    expect(r.finalEligibleMonths).toBe(15);
  });

  it('treatment=ignore is identical to today (passthrough)', () => {
    const r = adjustConfirmationIncrement(
      base({ rule: { treatment: 'ignore' } }),
    );
    expect(r.finalEligibleMonths).toBe(12);
    expect(r.periodCoveredMonths).toBe(0);
  });

  it('no confirmation increment recorded → naive months returned', () => {
    const r = adjustConfirmationIncrement(
      base({ confirmationIncrementGranted: false }),
    );
    expect(r.finalEligibleMonths).toBe(12);
  });

  it('confirmation effective AFTER cycle end → nothing covered in this cycle', () => {
    const r = adjustConfirmationIncrement(
      base({ confirmationIncrementEffectiveDate: '2027-01-01' }),
    );
    expect(r.periodCoveredMonths).toBe(0);
    expect(r.finalEligibleMonths).toBe(12);
  });

  it('covered period cannot exceed naive months (clamped)', () => {
    const r = adjustConfirmationIncrement(
      base({
        confirmationIncrementEffectiveDate: '2025-08-01',
        naiveEligibleMonths: 6,
      }),
    );
    expect(r.periodCoveredMonths).toBeLessThanOrEqual(6);
    expect(r.finalEligibleMonths).toBeGreaterThanOrEqual(0);
  });
});

describe('adjustConfirmationIncrement — transition eligibility gating', () => {
  it('Trainee with rule[Trainee] → adjustment applied', () => {
    const r = adjustConfirmationIncrement(base({
      preConfirmationStatus: 'Trainee',
      rule: { treatment: 'adjust_covered_period', applicableTransitions: ['trainee_to_confirmed'] },
    }));
    expect(r.treatmentApplied).toBe('adjust_covered_period');
    expect(r.finalEligibleMonths).toBeLessThan(12);
  });

  it('Probation with rule[Trainee] → skipped, naive months returned', () => {
    const r = adjustConfirmationIncrement(base({
      preConfirmationStatus: 'Probation',
      rule: { treatment: 'adjust_covered_period', applicableTransitions: ['trainee_to_confirmed'] },
    }));
    expect(r.treatmentApplied).toBe('ignore');
    expect(r.finalEligibleMonths).toBe(12);
    expect(r.adjustmentReason).toMatch(/not in rule applicability list/);
  });

  it('Probation with rule[Trainee, Probation] → adjustment applied', () => {
    const r = adjustConfirmationIncrement(base({
      preConfirmationStatus: 'Probation',
      rule: {
        treatment: 'adjust_covered_period',
        applicableTransitions: ['trainee_to_confirmed', 'probation_to_confirmed'],
      },
    }));
    expect(r.treatmentApplied).toBe('adjust_covered_period');
  });

  it('Unknown prior status with any rule → skipped', () => {
    const r = adjustConfirmationIncrement(base({
      preConfirmationStatus: null,
      rule: { treatment: 'shift_next_cycle', applicableTransitions: ['trainee_to_confirmed'] },
    }));
    expect(r.treatmentApplied).toBe('ignore');
    expect(r.finalEligibleMonths).toBe(12);
  });

  it('Legacy rule (no applicableTransitions field) → backward-compatible passthrough', () => {
    const r = adjustConfirmationIncrement(base({
      preConfirmationStatus: 'Probation',
      // No applicableTransitions → behaves as before (no gating)
      rule: { treatment: 'adjust_covered_period' },
    }));
    expect(r.treatmentApplied).toBe('adjust_covered_period');
  });

  it('statusToTransition maps known statuses case-insensitively', () => {
    expect(statusToTransition('trainee')).toBe('trainee_to_confirmed');
    expect(statusToTransition('PROBATION')).toBe('probation_to_confirmed');
    expect(statusToTransition('Contract')).toBe('contract_to_confirmed');
    expect(statusToTransition('Apprentice')).toBe('apprenticeship_to_confirmed');
    expect(statusToTransition('Confirmed')).toBeNull();
    expect(statusToTransition(null)).toBeNull();
  });
});