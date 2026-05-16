import { describe, it, expect } from 'vitest';
import {
  planBackfill,
  PlannerKpi,
  PlannerPeriod,
} from '../../supabase/functions/backfill-audit-assignments/planner';

const APR: PlannerPeriod = { year: 2026, period: 'April' };
const MAR: PlannerPeriod = { year: 2026, period: 'March' };
const FEB: PlannerPeriod = { year: 2026, period: 'February' };

function kpi(over: Partial<PlannerKpi> & { id: string; employee_id: string; kra_name: string; kpi_name: string }, p: PlannerPeriod): PlannerKpi {
  return {
    review_year: p.year,
    review_period: p.period,
    ...over,
  };
}

describe('planBackfill', () => {
  it('inherits the auditor when the source signature has a mapping', () => {
    const target = kpi({ id: 't1', employee_id: 'E1', kra_name: 'Safety', kpi_name: 'LTIFR' }, APR);
    const source = kpi({ id: 's1', employee_id: 'E1', kra_name: 'Safety', kpi_name: 'LTIFR' }, MAR);
    const out = planBackfill({
      target: APR,
      targetKpis: [target],
      alreadyAssignedTargetKpiIds: new Set(),
      candidateSourceKpisByPeriod: [{ period: MAR, kpis: [source] }],
      sourceAuditorByKpiId: new Map([['s1', 'A1']]),
    });
    expect(out.would_create).toBe(1);
    expect(out.rows).toEqual([
      { kpi_id: 't1', auditor_id: 'A1', source_kpi_id: 's1', source_period: MAR },
    ]);
  });

  it('skips target KPIs that are already assigned', () => {
    const target = kpi({ id: 't1', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, APR);
    const source = kpi({ id: 's1', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, MAR);
    const out = planBackfill({
      target: APR,
      targetKpis: [target],
      alreadyAssignedTargetKpiIds: new Set(['t1']),
      candidateSourceKpisByPeriod: [{ period: MAR, kpis: [source] }],
      sourceAuditorByKpiId: new Map([['s1', 'A1']]),
    });
    expect(out.already_mapped).toBe(1);
    expect(out.would_create).toBe(0);
    expect(out.rows).toHaveLength(0);
  });

  it('walks further back when most-recent source has no auditor', () => {
    const target = kpi({ id: 't1', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, APR);
    const sMar = kpi({ id: 'sMar', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, MAR);
    const sFeb = kpi({ id: 'sFeb', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, FEB);
    const out = planBackfill({
      target: APR,
      targetKpis: [target],
      alreadyAssignedTargetKpiIds: new Set(),
      candidateSourceKpisByPeriod: [
        { period: FEB, kpis: [sFeb] }, // intentionally out of order — planner sorts
        { period: MAR, kpis: [sMar] },
      ],
      sourceAuditorByKpiId: new Map([['sFeb', 'A_OLD']]),
    });
    expect(out.would_create).toBe(1);
    expect(out.rows[0]).toMatchObject({ auditor_id: 'A_OLD', source_period: FEB });
  });

  it('reports source_has_no_auditor when sources exist but none have a mapping', () => {
    const target = kpi({ id: 't1', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, APR);
    const source = kpi({ id: 's1', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, MAR);
    const out = planBackfill({
      target: APR,
      targetKpis: [target],
      alreadyAssignedTargetKpiIds: new Set(),
      candidateSourceKpisByPeriod: [{ period: MAR, kpis: [source] }],
      sourceAuditorByKpiId: new Map(),
    });
    expect(out.source_has_no_auditor).toBe(1);
    expect(out.would_create).toBe(0);
  });

  it('reports no_source_match when no signature matches', () => {
    const target = kpi({ id: 't1', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, APR);
    const out = planBackfill({
      target: APR,
      targetKpis: [target],
      alreadyAssignedTargetKpiIds: new Set(),
      candidateSourceKpisByPeriod: [{ period: MAR, kpis: [] }],
      sourceAuditorByKpiId: new Map(),
    });
    expect(out.no_source_match).toBe(1);
    expect(out.source_has_no_auditor).toBe(0);
  });

  it('never crosses employee/KRA/KPI boundaries', () => {
    const target = kpi({ id: 't1', employee_id: 'E1', kra_name: 'K', kpi_name: 'P' }, APR);
    const wrongEmp = kpi({ id: 's1', employee_id: 'E2', kra_name: 'K', kpi_name: 'P' }, MAR);
    const wrongKra = kpi({ id: 's2', employee_id: 'E1', kra_name: 'X', kpi_name: 'P' }, MAR);
    const wrongKpi = kpi({ id: 's3', employee_id: 'E1', kra_name: 'K', kpi_name: 'Q' }, MAR);
    const out = planBackfill({
      target: APR,
      targetKpis: [target],
      alreadyAssignedTargetKpiIds: new Set(),
      candidateSourceKpisByPeriod: [{ period: MAR, kpis: [wrongEmp, wrongKra, wrongKpi] }],
      sourceAuditorByKpiId: new Map([['s1', 'A'], ['s2', 'B'], ['s3', 'C']]),
    });
    expect(out.would_create).toBe(0);
    expect(out.no_source_match).toBe(1);
  });
});