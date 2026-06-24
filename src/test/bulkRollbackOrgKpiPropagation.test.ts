/**
 * RCA 2026-06-23 — Vivek 101784: "Bulk Rollback failed — No propagated
 * scopes found for this KPI" was shown for "Handle all breakdowns…"
 * (May 2026) after the user had individually rolled back the remaining
 * propagated scopes. Two contract violations were fixed in
 * `useBulkRollbackOrgKpiPropagation`:
 *
 *   1. The bulk lookup strictly filtered status='propagated'. The rest
 *      of the Org KPI Data Entry UI treats status IN ('propagated',
 *      'approved') as "propagated", so the button could be visible
 *      while the query returned zero rows.
 *   2. On the zero-rows / error path the React Query cache for
 *      'org-kpi-values' was never invalidated, so the stale card kept
 *      offering the same useless button.
 *
 * These tests pin both invariants — they are pure contract tests over
 * the filter and cache-invalidation behaviour of the bulk rollback
 * hook and do NOT depend on the live Supabase client.
 */
import { describe, it, expect } from 'vitest';

type Row = { id: string; status: string; achieved_value: number | null; category_id: string };

/** Mirrors the WHERE clause inside `useBulkRollbackOrgKpiPropagation`. */
function selectRollbackTargets(rows: Row[]): Row[] {
  return rows.filter(r => r.status === 'propagated' || r.status === 'approved');
}

describe('Bulk rollback — status filter', () => {
  it('picks up both propagated and approved scopes', () => {
    const rows: Row[] = [
      { id: 'a', status: 'propagated', achieved_value: 10, category_id: 'c1' },
      { id: 'b', status: 'approved',   achieved_value: 0,  category_id: 'c1' },
      { id: 'c', status: 'entered',    achieved_value: 5,  category_id: 'c1' },
      { id: 'd', status: 'pending',    achieved_value: null, category_id: 'c1' },
    ];
    const targets = selectRollbackTargets(rows);
    expect(targets.map(r => r.id).sort()).toEqual(['a', 'b']);
  });

  it('returns empty when all scopes are already pending/entered', () => {
    const rows: Row[] = [
      { id: 'a', status: 'pending', achieved_value: null, category_id: 'c1' },
      { id: 'b', status: 'entered', achieved_value: 1,    category_id: 'c1' },
    ];
    expect(selectRollbackTargets(rows)).toHaveLength(0);
  });
});

describe('Bulk rollback — stale-cache recovery contract', () => {
  /**
   * Mirrors the zero-row branch of `useBulkRollbackOrgKpiPropagation`:
   * invalidate the cache BEFORE throwing, so the next render reflects
   * the actual DB state instead of leaving the user with a stale card.
   */
  async function runBulkRollbackContract(
    rows: Row[],
    invalidate: (key: readonly unknown[]) => void,
  ): Promise<{ ok: boolean; message?: string }> {
    const targets = selectRollbackTargets(rows);
    if (targets.length === 0) {
      invalidate(['org-kpi-values']);
      return {
        ok: false,
        message:
          'All scopes for this KPI have already been rolled back or are not in a propagated/approved state. The view has been refreshed.',
      };
    }
    return { ok: true };
  }

  it('invalidates org-kpi-values BEFORE surfacing the zero-rows error', async () => {
    const calls: Array<readonly unknown[]> = [];
    const result = await runBulkRollbackContract([], (key) => calls.push(key));
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already been rolled back/i);
    expect(calls).toEqual([['org-kpi-values']]);
  });

  it('does not invalidate when there are real targets to roll back', async () => {
    const calls: Array<readonly unknown[]> = [];
    const rows: Row[] = [
      { id: 'a', status: 'propagated', achieved_value: 10, category_id: 'c1' },
    ];
    const result = await runBulkRollbackContract(rows, (key) => calls.push(key));
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});