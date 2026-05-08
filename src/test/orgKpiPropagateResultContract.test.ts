import { describe, it, expect } from 'vitest';

/**
 * RCA 2026-05-08 — propagate_org_kpi_value RPC result contract.
 *
 * The live RPC returns:
 *   { propagated, skipped (number|array), results, skipped_details }
 * An older migration returned:
 *   { propagated_count, skipped_count, details, skipped }
 *
 * The frontend mapper in `src/hooks/usePropagateOrgKpiValue.ts`
 * (`callPropagationRpc`) MUST handle either shape so the per-batch
 * summary toast and the half-propagation guard report correct counts.
 *
 * This test mirrors the mapper logic to lock the contract.
 */
function mapRpcResult(rpcResult: any) {
  const detailsRaw = rpcResult.details ?? rpcResult.results ?? [];
  const skippedRaw = Array.isArray(rpcResult.skipped)
    ? rpcResult.skipped
    : (rpcResult.skipped_details ?? []);
  const propagatedCount = (rpcResult.propagated_count ?? rpcResult.propagated ?? 0) as number;
  const skippedCount = (rpcResult.skipped_count
    ?? (typeof rpcResult.skipped === 'number' ? rpcResult.skipped : skippedRaw.length)
    ?? 0) as number;
  return { propagatedCount, skippedCount, detailsLen: detailsRaw.length, skippedLen: skippedRaw.length };
}

describe('propagate_org_kpi_value RPC result contract', () => {
  it('parses the LIVE shape (propagated / skipped / results / skipped_details)', () => {
    const live = {
      propagated: 40,
      skipped: 10,
      results: Array.from({ length: 40 }, (_, i) => ({ kpi_id: `k${i}` })),
      skipped_details: Array.from({ length: 10 }, (_, i) => ({ kpi_id: `s${i}`, reason: 'not_in_kra_set' })),
    };
    expect(mapRpcResult(live)).toEqual({
      propagatedCount: 40, skippedCount: 10, detailsLen: 40, skippedLen: 10,
    });
  });

  it('parses the LEGACY shape (propagated_count / skipped_count / details / skipped)', () => {
    const legacy = {
      propagated_count: 5,
      skipped_count: 2,
      details: [{ kpi_id: 'a' }, { kpi_id: 'b' }, { kpi_id: 'c' }, { kpi_id: 'd' }, { kpi_id: 'e' }],
      skipped: [{ kpi_id: 'x', reason: 'reviewer_locked' }, { kpi_id: 'y', reason: 'not_in_kra_set' }],
    };
    expect(mapRpcResult(legacy)).toEqual({
      propagatedCount: 5, skippedCount: 2, detailsLen: 5, skippedLen: 2,
    });
  });

  it('never returns undefined counts (regression — the bug produced NaN totals)', () => {
    const empty = {};
    const r = mapRpcResult(empty);
    expect(r.propagatedCount).toBe(0);
    expect(r.skippedCount).toBe(0);
  });
});
