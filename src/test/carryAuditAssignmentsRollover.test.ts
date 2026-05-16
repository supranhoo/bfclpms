import { describe, it, expect } from 'vitest';

/**
 * Unit-tests the pure matching contract used by `auto-rollover-kpis` when
 * `carry_audit_assignments=true`:
 *
 * 1. For each newly created target KPI, we look up the source KPI via the
 *    signature `${employee_id}|${review_year}|${review_period}|${kra_name}|${kpi_name}`.
 * 2. If that source KPI had an entry in `audit_kpi_level_assignments`, the
 *    target KPI inherits the same `auditor_id`.
 * 3. UNIQUE(kpi_id) on the target table means upsert-ignore-duplicates leaves
 *    any pre-existing auditor assignment on the target KPI untouched.
 */

type SourceKpi = { id: string; employee_id: string; review_year: number; review_period: string; kra_name: string; kpi_name: string };
type TargetKpi = SourceKpi;

function sig(k: { employee_id: string; review_year: number; review_period: string; kra_name: string; kpi_name: string }) {
  return `${k.employee_id}|${k.review_year}|${k.review_period}|${k.kra_name}|${k.kpi_name}`;
}

/**
 * Mirrors the edge-function logic exactly: at clone-time we store a map
 * keyed by the TARGET signature (target year + target period + employee +
 * KRA + KPI name) whose value is the SOURCE kpi id we cloned from. Then
 * after KPIs are inserted we re-fetch the target rows, rebuild the same
 * signature, and look up which source KPI to inherit the auditor from.
 */
function planAuditCarryForward(
  // sigToSourceKpiId: mapping captured during the rollover insert phase
  sigToSourceKpiId: Map<string, string>,
  targetKpis: TargetKpi[],
  sourceAssignments: Record<string, string>, // src_kpi_id → auditor_id
  existingTargetAssignedKpiIds: Set<string>,
) {
  const toCreate: { kpi_id: string; auditor_id: string }[] = [];
  let preservedCount = 0;

  for (const t of targetKpis) {
    const srcId = sigToSourceKpiId.get(sig(t));
    if (!srcId) continue;
    const auditor = sourceAssignments[srcId];
    if (!auditor) continue;
    if (existingTargetAssignedKpiIds.has(t.id)) {
      preservedCount++;
      continue;
    }
    toCreate.push({ kpi_id: t.id, auditor_id: auditor });
  }

  return { toCreate, preservedCount };
}

function buildSigMap(pairs: Array<{ src: SourceKpi; targetMonth: string; targetYear: number }>) {
  const m = new Map<string, string>();
  for (const { src, targetMonth, targetYear } of pairs) {
    m.set(
      `${src.employee_id}|${targetYear}|${targetMonth}|${src.kra_name}|${src.kpi_name}`,
      src.id,
    );
  }
  return m;
}

describe('carry_audit_assignments — source → target matching', () => {
  const baseSrc: SourceKpi = {
    id: 'src-1', employee_id: 'emp-1', review_year: 2026,
    review_period: 'March', kra_name: 'Quality', kpi_name: 'Defect rate',
  };
  const baseTgt: TargetKpi = { ...baseSrc, id: 'tgt-1', review_period: 'April' };

  it('clones auditor mapping onto the new target KPI', () => {
    const plan = planAuditCarryForward(
      buildSigMap([{ src: baseSrc, targetMonth: 'April', targetYear: 2026 }]),
      [baseTgt],
      { 'src-1': 'auditor-99' },
      new Set(),
    );
    expect(plan.toCreate).toEqual([{ kpi_id: 'tgt-1', auditor_id: 'auditor-99' }]);
    expect(plan.preservedCount).toBe(0);
  });

  it('preserves existing target assignments (UNIQUE kpi_id semantics)', () => {
    const plan = planAuditCarryForward(
      buildSigMap([{ src: baseSrc, targetMonth: 'April', targetYear: 2026 }]),
      [baseTgt],
      { 'src-1': 'auditor-99' },
      new Set(['tgt-1']),
    );
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.preservedCount).toBe(1);
  });

  it('ignores source KPIs that have no audit assignment', () => {
    const plan = planAuditCarryForward(
      buildSigMap([{ src: baseSrc, targetMonth: 'April', targetYear: 2026 }]),
      [baseTgt],
      {},
      new Set(),
    );
    expect(plan.toCreate).toHaveLength(0);
  });

  it('matches by full signature — different employee/period/KRA/KPI never collide', () => {
    const src2: SourceKpi = { ...baseSrc, id: 'src-2', employee_id: 'emp-2', kpi_name: 'Throughput' };
    const tgt2: TargetKpi = { ...src2, id: 'tgt-2', review_period: 'April' };
    const plan = planAuditCarryForward(
      buildSigMap([
        { src: baseSrc, targetMonth: 'April', targetYear: 2026 },
        { src: src2, targetMonth: 'April', targetYear: 2026 },
      ]),
      [baseTgt, tgt2],
      { 'src-1': 'aud-A', 'src-2': 'aud-B' },
      new Set(),
    );
    expect(plan.toCreate).toEqual([
      { kpi_id: 'tgt-1', auditor_id: 'aud-A' },
      { kpi_id: 'tgt-2', auditor_id: 'aud-B' },
    ]);
  });

  it('skips target KPIs whose source has no counterpart (e.g. brand-new KPI)', () => {
    const orphanTgt: TargetKpi = {
      id: 'tgt-orphan', employee_id: 'emp-1', review_year: 2026,
      review_period: 'April', kra_name: 'Quality', kpi_name: 'NEW kpi this period',
    };
    const plan = planAuditCarryForward(
      buildSigMap([{ src: baseSrc, targetMonth: 'April', targetYear: 2026 }]),
      [baseTgt, orphanTgt],
      { 'src-1': 'auditor-99' },
      new Set(),
    );
    expect(plan.toCreate).toEqual([{ kpi_id: 'tgt-1', auditor_id: 'auditor-99' }]);
  });
});