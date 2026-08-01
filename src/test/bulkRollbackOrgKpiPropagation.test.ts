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
import { hasBulkRollbackTarget } from '@/lib/orgKpiStatus';

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

/**
 * ADR-091 — Bulk Rollback button visibility must follow OKV-truth
 * (per-scope status) and not the fact-based card-tile status. Repro for
 * "Handle all breakdowns…" May 2026: card shows Propagated because every
 * child KPI advanced past kra_set (manager_check/approved/self_review),
 * but OKV has 1 pending row. The bulk hook can't act on that — so the
 * button MUST be hidden, not just throw on click.
 */
describe('Bulk Rollback gate — OKV-truth (ADR-091)', () => {
  it('hides the button when every scoped row is pending/entered (fact-based propagated card)', () => {
    const scopedRows = [
      { status: 'pending' as const },
      { status: 'pending' as const },
      { status: 'entered' as const },
    ];
    expect(hasBulkRollbackTarget(scopedRows)).toBe(false);
  });

  it('shows the button when at least one scope is propagated', () => {
    const scopedRows = [
      { status: 'pending' as const },
      { status: 'propagated' as const },
    ];
    expect(hasBulkRollbackTarget(scopedRows)).toBe(true);
  });

  it('shows the button when at least one scope is approved', () => {
    expect(hasBulkRollbackTarget([{ status: 'approved' }])).toBe(true);
  });

  it('hides the button for empty/undefined scoped rows', () => {
    expect(hasBulkRollbackTarget([])).toBe(false);
    expect(hasBulkRollbackTarget(undefined)).toBe(false);
    expect(hasBulkRollbackTarget(null)).toBe(false);
  });
});
// =============================================================================
// ADR-227 — child-truth rollback
// =============================================================================

import { deriveScopedRowStatus } from '@/lib/orgKpiStatus';

/** Mirrors the child-truth work list of rollback_org_kpi_propagation_by_children. */
type ChildKpi = { id: string; status: string };
const FROZEN = new Set(['approved', 'management_review']);
function planChildRollback(children: ChildKpi[]) {
  const targets = children.filter(k => !FROZEN.has(k.status));
  return {
    targets,
    managerStageCleared: targets.filter(k => k.status !== 'kra_set' && k.status !== 'self_review').length,
    skippedApproved: children.length - targets.length,
  };
}

describe('ADR-227 — child-truth bulk rollback plan', () => {
  it('acts even when every master row is draft (July 2026 case)', () => {
    const masterRows = [{ status: 'draft' }, { status: 'draft' }];
    expect(selectRollbackTargets(
      masterRows.map((r, i) => ({ id: String(i), achieved_value: null, category_id: 'c', ...r })),
    )).toHaveLength(0);

    const plan = planChildRollback([
      { id: 'a', status: 'self_review' },
      { id: 'b', status: 'manager_check' },
    ]);
    expect(plan.targets).toHaveLength(2);
  });

  it('force-resets manager_check cells and counts them', () => {
    const plan = planChildRollback([
      { id: 'a', status: 'self_review' },
      { id: 'b', status: 'manager_check' },
      { id: 'c', status: 'manager_check' },
      { id: 'd', status: 'kra_set' },
    ]);
    expect(plan.targets.map(t => t.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(plan.managerStageCleared).toBe(2);
  });

  it('never touches approved or management_review cells', () => {
    const plan = planChildRollback([
      { id: 'a', status: 'approved' },
      { id: 'b', status: 'management_review' },
      { id: 'c', status: 'self_review' },
    ]);
    expect(plan.targets.map(t => t.id)).toEqual(['c']);
    expect(plan.skippedApproved).toBe(2);
  });

  it('button gate stays aligned with the child-truth action', () => {
    // Master row draft + child past kra_set → derived row status "propagated".
    const rowStatus = deriveScopedRowStatus({
      okvStatus: 'draft',
      okvHasValue: false,
      isInPropagatedSet: false,
      hasSubmissionFallback: false,
      isPastKraSet: true,
    });
    expect(rowStatus).toBe('propagated');
    expect(hasBulkRollbackTarget([{ status: rowStatus }])).toBe(true);
  });
});
