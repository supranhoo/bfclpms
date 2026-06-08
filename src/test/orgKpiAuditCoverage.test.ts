import { describe, it, expect } from 'vitest';
import { computeOrgKpiCoverageGaps } from '@/lib/orgKpiAuditCoverage';

const row = (kpi: string, emp: string, kpi_name = 'Adherence to Manning Norms', kra = 'Adherence to Monthly Budget') =>
  ({ kpi_id: kpi, employee_id: emp, kpi_name, kra_name: kra });

describe('computeOrgKpiCoverageGaps — June 2026 Sindhu Raj Singh RCA', () => {
  const orgKpiIds = new Set(['k_a', 'k_b', 'k_c', 'k_d', 'k_e', 'k_f']);

  it('reports gap when KPI-level assignments only cover 5 of 6 employees', () => {
    const rows = [
      row('k_a', 'e1'), row('k_b', 'e2'), row('k_c', 'e3'),
      row('k_d', 'e4'), row('k_e', 'e5'),
      row('k_f', 'e6_sindhu'), // unassigned auditor coverage
    ];
    const scope = {
      employeeIds: new Set<string>(),
      kpiIds: new Set(['k_a', 'k_b', 'k_c', 'k_d', 'k_e']),
    };
    const gaps = computeOrgKpiCoverageGaps(rows, orgKpiIds, scope);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      kpi_name: 'Adherence to Manning Norms',
      total: 6,
      covered: 5,
      missingEmpIds: ['e6_sindhu'],
    });
  });

  it('returns [] when every employee is covered', () => {
    const rows = [row('k_a', 'e1'), row('k_b', 'e2')];
    const scope = { employeeIds: new Set<string>(), kpiIds: new Set(['k_a', 'k_b']) };
    expect(computeOrgKpiCoverageGaps(rows, orgKpiIds, scope)).toEqual([]);
  });

  it('employee-level assignment (`audit_kpi_assignments`) covers all KPIs of that emp', () => {
    const rows = [row('k_a', 'e1'), row('k_b', 'e1'), row('k_c', 'e2')];
    const scope = { employeeIds: new Set(['e1']), kpiIds: new Set<string>() };
    const gaps = computeOrgKpiCoverageGaps(rows, orgKpiIds, scope);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].missingEmpIds).toEqual(['e2']);
  });

  it('ignores non-org KPIs (those not in orgKpiIds set)', () => {
    const rows = [row('non_org_1', 'e1'), row('non_org_2', 'e2')];
    const scope = { employeeIds: new Set<string>(), kpiIds: new Set<string>() };
    expect(computeOrgKpiCoverageGaps(rows, new Set(), scope)).toEqual([]);
  });

  it('sorts results so the biggest gap is first', () => {
    const rows = [
      // KPI alpha: 1 of 3 covered → gap 2
      row('k_a', 'e1', 'Alpha'), row('k_a', 'e2', 'Alpha'), row('k_a', 'e3', 'Alpha'),
      // KPI beta: 1 of 4 covered → gap 3
      row('k_b', 'e1', 'Beta'), row('k_b', 'e2', 'Beta'), row('k_b', 'e3', 'Beta'), row('k_b', 'e4', 'Beta'),
    ];
    const scope = { employeeIds: new Set(['e1']), kpiIds: new Set<string>() };
    const gaps = computeOrgKpiCoverageGaps(rows, orgKpiIds, scope);
    expect(gaps.map(g => g.kpi_name)).toEqual(['Beta', 'Alpha']);
  });
});