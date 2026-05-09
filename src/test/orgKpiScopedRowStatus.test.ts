import { describe, it, expect } from 'vitest';
import { deriveScopedRowStatus } from '@/lib/orgKpiStatus';

/**
 * RCA-2026-05-09 — Per-row "Propagated / Not propagated" pill in the
 * Org KPI scoped table must agree with the card-level pill (ADR-055).
 * The user-visible regression: an employee whose child kpis row had
 * advanced to manager_check still showed "Not propagated" because OKV
 * was stuck at 'entered' and the snapshot RPC's propagatedEmpIdsByKey
 * didn't include the row.
 */
describe('deriveScopedRowStatus', () => {
  it('returns "approved" when OKV is approved (highest precedence)', () => {
    expect(
      deriveScopedRowStatus({
        okvStatus: 'approved',
        okvHasValue: true,
        isInPropagatedSet: false,
        hasSubmissionFallback: false,
        isPastKraSet: false,
      }),
    ).toBe('approved');
  });

  it('returns "propagated" when isPastKraSet even if OKV.status is "entered"', () => {
    // The exact regression case: OKV stuck at 'entered', snapshot RPC
    // didn't catch it, no submission fallback — but the child KPI has
    // genuinely advanced to manager_check. Should be propagated.
    expect(
      deriveScopedRowStatus({
        okvStatus: 'entered',
        okvHasValue: true,
        isInPropagatedSet: false,
        hasSubmissionFallback: false,
        isPastKraSet: true,
      }),
    ).toBe('propagated');
  });

  it('returns "propagated" when the snapshot RPC says so', () => {
    expect(
      deriveScopedRowStatus({
        okvStatus: 'entered',
        okvHasValue: true,
        isInPropagatedSet: true,
        hasSubmissionFallback: false,
        isPastKraSet: false,
      }),
    ).toBe('propagated');
  });

  it('returns "propagated" when only the submission fallback proves it', () => {
    expect(
      deriveScopedRowStatus({
        okvStatus: null,
        okvHasValue: false,
        isInPropagatedSet: false,
        hasSubmissionFallback: true,
        isPastKraSet: false,
      }),
    ).toBe('propagated');
  });

  it('returns "entered" when OKV has a value but child still in kra_set', () => {
    expect(
      deriveScopedRowStatus({
        okvStatus: 'entered',
        okvHasValue: true,
        isInPropagatedSet: false,
        hasSubmissionFallback: false,
        isPastKraSet: false,
      }),
    ).toBe('entered');
  });

  it('returns "pending" when nothing has been entered', () => {
    expect(
      deriveScopedRowStatus({
        okvStatus: null,
        okvHasValue: false,
        isInPropagatedSet: false,
        hasSubmissionFallback: false,
        isPastKraSet: false,
      }),
    ).toBe('pending');
  });
});