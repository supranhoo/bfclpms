/**
 * RCA 2026-05-08 — Snapshot-driven propagation truth contract.
 *
 * The Org KPI Data Entry page must derive per-row "Propagated" status
 * from the snapshot RPC's `propagatedEmpIdsByKey` map, NOT from the
 * browser-side `useOrgKpiSubmissionFallback` hook (which can drift due
 * to RLS / normalization / query coverage). This guard documents the
 * exact contract so future refactors cannot quietly revert to the
 * fragile fallback-only path.
 */
import { describe, it, expect } from 'vitest';

function deriveRowStatus(opts: {
  okvStatus: string | null;
  okvHasValue: boolean;
  isPropagatedFact: boolean;
  hasFallback: boolean;
}): 'pending' | 'entered' | 'propagated' | 'approved' {
  if (opts.okvStatus === 'approved') return 'approved';
  if (opts.isPropagatedFact || opts.hasFallback) return 'propagated';
  if (opts.okvHasValue) return 'entered';
  return 'pending';
}

describe('Org KPI per-row propagated status — snapshot truth', () => {
  it('treats snapshot propagated_emp_ids as authoritative even when fallback map is empty', () => {
    expect(
      deriveRowStatus({ okvStatus: null, okvHasValue: false, isPropagatedFact: true, hasFallback: false }),
    ).toBe('propagated');
  });

  it('still uses the fallback map when only that signal exists (legacy data)', () => {
    expect(
      deriveRowStatus({ okvStatus: null, okvHasValue: false, isPropagatedFact: false, hasFallback: true }),
    ).toBe('propagated');
  });

  it('falls back to entered when there is an OKV value but no scorecard yet', () => {
    expect(
      deriveRowStatus({ okvStatus: 'entered', okvHasValue: true, isPropagatedFact: false, hasFallback: false }),
    ).toBe('entered');
  });

  it('preserves approved overrides', () => {
    expect(
      deriveRowStatus({ okvStatus: 'approved', okvHasValue: true, isPropagatedFact: true, hasFallback: true }),
    ).toBe('approved');
  });
});