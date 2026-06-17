import { describe, it, expect } from 'vitest';
import { isRowInMyReviewScope } from '@/lib/bulkAuditScopeFilter';

/**
 * Pure-function simulator of `public.stage_ready_kpis(period, year, stage)`.
 * Mirrors the SQL CTEs `base → staged → ready`:
 *   - For each row, look up the resolved workflow.
 *   - Find the index of `stage_token` (the workflow stage name for `stage`).
 *   - prev_stage = wf[idx-1].
 *   - Row is "stage-ready" iff status === prev_stage (and prev_stage exists).
 *
 * Admin guard: when the caller is not admin the function returns nothing —
 * here we simulate by gating on `isAdmin`.
 */
const STAGE_TOKEN: Record<string, string> = {
  manager: 'manager_check',
  functional_manager: 'functional_manager_check',
  skip_level: 'skip_level_check',
  auditor: 'audit',
  hr_pms: 'hr_pms_review',
  management: 'management_review',
};

interface SimRow {
  kpi_id: string;
  employee_id: string;
  status: string | null;
  workflow: string[];
}

function stageReadyPairs(
  rows: SimRow[],
  stage: string,
  isAdmin: boolean,
): Set<string> {
  if (!isAdmin) return new Set();
  const token = STAGE_TOKEN[stage];
  if (!token) return new Set();
  const out = new Set<string>();
  for (const r of rows) {
    const idx = r.workflow.indexOf(token);
    if (idx <= 0) continue; // not in workflow or no predecessor
    const prev = r.workflow[idx - 1];
    if (r.status === prev) out.add(`${r.kpi_id}|${r.employee_id}`);
  }
  return out;
}

const WF = ['self_review', 'manager_check', 'audit', 'hr_pms_review'];

const rows: SimRow[] = [
  { kpi_id: 'k1', employee_id: 'e-self',    status: 'self_review',   workflow: WF },
  { kpi_id: 'k2', employee_id: 'e-mgr',     status: 'manager_check', workflow: WF },
  { kpi_id: 'k3', employee_id: 'e-aud',     status: 'audit',         workflow: WF },
  { kpi_id: 'k4', employee_id: 'e-hr',      status: 'hr_pms_review', workflow: WF },
  { kpi_id: 'k5', employee_id: 'e-null',    status: null,            workflow: WF },
];

describe('Admin Stage-ready filter — bulk review', () => {
  it('returns nothing for non-admin callers (RPC-level guard)', () => {
    expect(stageReadyPairs(rows, 'hr_pms', false).size).toBe(0);
  });

  it('HR PMS view shows only rows whose status = audit (predecessor)', () => {
    const pairs = stageReadyPairs(rows, 'hr_pms', true);
    expect(Array.from(pairs)).toEqual(['k3|e-aud']);
  });

  it('Auditor view shows only rows whose status = manager_check', () => {
    const pairs = stageReadyPairs(rows, 'auditor', true);
    expect(Array.from(pairs)).toEqual(['k2|e-mgr']);
  });

  it('Manager view shows only rows whose status = self_review', () => {
    const pairs = stageReadyPairs(rows, 'manager', true);
    expect(Array.from(pairs)).toEqual(['k1|e-self']);
  });

  it('excludes rows with NULL status (no predecessor match)', () => {
    const pairs = stageReadyPairs(rows, 'manager', true);
    expect(pairs.has('k5|e-null')).toBe(false);
  });

  it('returns empty when the workflow does not include the requested stage', () => {
    const wfNoAudit = ['self_review', 'manager_check', 'hr_pms_review'];
    const r = [{ kpi_id: 'kx', employee_id: 'ex', status: 'manager_check', workflow: wfNoAudit }];
    expect(stageReadyPairs(r, 'auditor', true).size).toBe(0);
    // But HR PMS still works against its actual predecessor (manager_check)
    expect(Array.from(stageReadyPairs(r, 'hr_pms', true))).toEqual(['kx|ex']);
  });

  it('REGRESSION: Anil Pathak (200301) 5S row is hidden from admin HR PMS view (status=self_review)', () => {
    const anil: SimRow = {
      kpi_id: 'kpi-5s-may26',
      employee_id: 'e-anil-200301',
      status: 'self_review',
      workflow: WF,
    };
    const pairs = stageReadyPairs([anil], 'hr_pms', true);
    expect(pairs.size).toBe(0);
    // And the row-predicate used by the dashboard agrees:
    expect(
      isRowInMyReviewScope(
        { kpi_id: anil.kpi_id, employee_id: anil.employee_id },
        pairs,
      ),
    ).toBe(false);
  });

  it('unknown stage token yields empty set (defensive)', () => {
    expect(stageReadyPairs(rows, 'employee', true).size).toBe(0);
  });

  // v2.66.39 — Mirrors the live May 2026 shape: the dominant HR PMS-ready
  // workflow skips audit (`…manager_check → hr_pms_review …`), so the
  // predecessor for HR PMS is `manager_check`, not `audit`. The original
  // SQL bug (enum vs text) silently returned 0 here; this test exists so
  // any future predicate rewrite continues to surface these rows.
  it('REGRESSION (v2.66.39): HR PMS-ready when predecessor is manager_check', () => {
    const wf = ['kra_set', 'self_review', 'manager_check', 'hr_pms_review', 'approved'];
    const ready: SimRow = {
      kpi_id: 'kpi-may26-mgr-pred',
      employee_id: 'e-mgr-pred',
      status: 'manager_check',
      workflow: wf,
    };
    const notReady: SimRow = {
      kpi_id: 'kpi-may26-self-pred',
      employee_id: 'e-self-pred',
      status: 'self_review',
      workflow: wf,
    };
    const pairs = stageReadyPairs([ready, notReady], 'hr_pms', true);
    expect(Array.from(pairs)).toEqual(['kpi-may26-mgr-pred|e-mgr-pred']);
  });
});