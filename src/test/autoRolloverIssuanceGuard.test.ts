import { describe, it, expect } from 'vitest';
import {
  exceedsScheduledWeightageLimit,
  projectedTargetWeightage,
  resolveInvocationMode,
  resolveIssuanceSkipSet,
} from '../../supabase/functions/auto-rollover-kpis/rolloverGuard';

/**
 * ADR-248 / POLICY §KRA-PERIOD-ISSUANCE.
 *
 * Mirrors the guard added to `auto-rollover-kpis`: the monthly cron must not
 * re-add KPIs into a target period that was deliberately prepared, because
 * dedup alone cannot tell "never prepared" from "prepared, KPI dropped on
 * purpose" — the observed failure was total weightage inflating past 100.
 */

const base = {
  mode: 'scheduled' as const,
  employeeIds: ['e1', 'e2', 'e3'],
  issuedEmployeeIds: [],
  targetKpis: [],
  targetMonth: 'July',
};

describe('auto-rollover issuance guard', () => {
  it('classifies the deployed cron payload as scheduled', () => {
    expect(resolveInvocationMode({ triggeredBy: 'cron', hasValidCronSecret: true })).toBe('scheduled');
  });

  it('classifies a valid cron-secret request as scheduled regardless of its body label', () => {
    expect(resolveInvocationMode({ triggeredBy: 'admin_manual', hasValidCronSecret: true })).toBe('scheduled');
  });

  it('keeps the legacy system label fail-safe for dry-run probes', () => {
    expect(resolveInvocationMode({ triggeredBy: 'system', hasValidCronSecret: false })).toBe('scheduled');
  });

  it('cron skips employees whose target period is explicitly marked issued', () => {
    const skip = resolveIssuanceSkipSet({ ...base, issuedEmployeeIds: ['e2'] });
    expect([...skip]).toEqual(['e2']);
  });

  it('cron skips employees who already have KPIs in the target month (backstop)', () => {
    const skip = resolveIssuanceSkipSet({
      ...base,
      targetKpis: [{ employee_id: 'e3', review_period: 'July' }],
    });
    expect(skip.has('e3')).toBe(true);
  });

  it('sibling cycle months do not trigger the backstop', () => {
    const skip = resolveIssuanceSkipSet({
      ...base,
      targetKpis: [{ employee_id: 'e3', review_period: 'September' }],
    });
    expect(skip.size).toBe(0);
  });

  it('manual admin runs are never blocked — balances can still be topped up', () => {
    const skip = resolveIssuanceSkipSet({
      ...base,
      mode: 'manual',
      issuedEmployeeIds: ['e1', 'e2'],
      targetKpis: [{ employee_id: 'e3', review_period: 'July' }],
    });
    expect(skip.size).toBe(0);
  });

  it('force=true bypasses the guard for a cron-triggered rerun', () => {
    const skip = resolveIssuanceSkipSet({ ...base, force: true, issuedEmployeeIds: ['e1'] });
    expect(skip.size).toBe(0);
  });

  it('never skips employees outside the requested set', () => {
    const skip = resolveIssuanceSkipSet({ ...base, issuedEmployeeIds: ['e9'] });
    expect(skip.size).toBe(0);
  });
});

/** Weightage guard: flag, never silently inflate. */
function weightageWarnings(rows: Array<{ employee_id: string; weightage: number }>) {
  const totals: Record<string, number> = {};
  for (const r of rows) totals[r.employee_id] = (totals[r.employee_id] ?? 0) + Number(r.weightage ?? 0);
  return Object.entries(totals)
    .filter(([, t]) => t > 100.5)
    .map(([employee_id, t]) => ({ employee_id, total_weightage: Math.round(t * 100) / 100 }));
}

describe('rollover weightage guard', () => {
  it('flags employees above 100 total weightage', () => {
    const w = weightageWarnings([
      { employee_id: 'e1', weightage: 60 },
      { employee_id: 'e1', weightage: 55 },
      { employee_id: 'e2', weightage: 100 },
    ]);
    expect(w).toEqual([{ employee_id: 'e1', total_weightage: 115 }]);
  });

  it('tolerates rounding noise at exactly 100', () => {
    expect(weightageWarnings([{ employee_id: 'e1', weightage: 100.2 }])).toEqual([]);
  });

  it('blocks the production failure shape before insert', () => {
    const projected = projectedTargetWeightage(
      [{ review_period: 'September', weightage: 100 }],
      [{ review_period: 'September', weightage: 55 }],
      'September',
    );
    expect(projected).toBe(155);
    expect(exceedsScheduledWeightageLimit(projected)).toBe(true);
  });

  it('does not count later cycle siblings against the exact target month', () => {
    const projected = projectedTargetWeightage(
      [],
      [
        { review_period: 'September', weightage: 50 },
        { review_period: 'October', weightage: 60 },
      ],
      'September',
    );
    expect(projected).toBe(50);
    expect(exceedsScheduledWeightageLimit(projected)).toBe(false);
  });
});
