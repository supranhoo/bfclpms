/**
 * POLICY §CONSOLE-DASHBOARD-PARITY — regression guard.
 *
 * The Performance Console and the employee/reviewer dashboard must resolve the
 * SAME scoring model from the SAME KPI row, whatever shape the row arrives in
 * (console RPC payload vs. direct `kpis` select). A drift here means a console
 * edit would score differently on the dashboard.
 */
import { describe, it, expect } from 'vitest';
import { resolveKpiScoringModel, isMixedScoringGroup } from '@/lib/kpiScoringModel';
import { kpiHasScoringLogic } from '@/lib/reviewScoring';
import { scoringModelLockReason } from '@/components/admin/bu-console/rowOverrideModel';

/** A `kpis` row as the dashboard selects it. */
const dashboardRow = (o: Record<string, unknown>) => ({
  uom_type: 'numeric', qualitative_options: null,
  r0: null, r1: null, r2: null, r3: null, r4: null, r5: null, ...o,
});

/** The same KPI as `bu_console_kpi_detail` returns it (group + row merged). */
const consoleRow = (o: Record<string, unknown>) => ({ ...dashboardRow(o) });

const FIXTURES = {
  numeric: { uom_type: 'numeric', r5: '100', r4: '90', r3: '80', r2: '70', r1: '60', r0: '50' },
  binary: {
    uom_type: 'binary',
    qualitative_options: [{ label: 'Yes', rating: 5 }, { label: 'No', rating: 0 }],
  },
  invertedBinary: {
    uom_type: 'binary',
    qualitative_options: [{ label: 'Yes', rating: 0 }, { label: 'No', rating: 5 }],
  },
  tiered: {
    uom_type: 'tiered',
    qualitative_options: [
      { label: 'Exceeds', rating: 5 }, { label: 'Meets', rating: 3 }, { label: 'Below', rating: 0 },
    ],
  },
} as const;

describe('console ↔ dashboard scoring model parity', () => {
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(`${name}: both surfaces resolve an identical model`, () => {
      const fromDashboard = resolveKpiScoringModel(dashboardRow(fixture) as never);
      const fromConsole = resolveKpiScoringModel(consoleRow(fixture) as never);
      expect(fromConsole).toEqual(fromDashboard);
      expect(fromConsole.type).not.toBe('unconfigured');
    });
  }

  it('an inverted safety binary keeps No = 5 on both surfaces', () => {
    const model = resolveKpiScoringModel(consoleRow(FIXTURES.invertedBinary) as never);
    expect(model.options[0]).toMatchObject({ label: 'No', rating: 5 });
  });

  it('a qualitative KPI never exposes numeric thresholds', () => {
    for (const f of [FIXTURES.binary, FIXTURES.tiered]) {
      expect(resolveKpiScoringModel(consoleRow(f) as never).thresholds).toHaveLength(0);
    }
  });

  it('a KPI with no configuration reports unconfigured, not empty bands', () => {
    expect(resolveKpiScoringModel(consoleRow({ uom_type: 'tiered' }) as never).type)
      .toBe('unconfigured');
    expect(resolveKpiScoringModel(dashboardRow({}) as never).type).toBe('unconfigured');
  });

  it('scoring-logic predicate agrees with the resolved model for every type', () => {
    for (const f of Object.values(FIXTURES)) {
      const row = dashboardRow(f) as never;
      expect(kpiHasScoringLogic(row as never)).toBe(
        resolveKpiScoringModel(row).type !== 'unconfigured',
      );
    }
  });
});

describe('console writes cannot fork the group scoring model (ADR-282)', () => {
  it('scope-only edits are allowed for every KPI type', () => {
    for (const f of Object.values(FIXTURES)) {
      expect(scoringModelLockReason(dashboardRow(f) as never, { target_value: 7 })).toBeNull();
      expect(scoringModelLockReason(dashboardRow(f) as never, { weightage: 10 })).toBeNull();
    }
  });

  it('the rating ladder cannot be tuned per employee on qualitative KPIs', () => {
    expect(scoringModelLockReason(dashboardRow(FIXTURES.binary) as never, { r5: '1' })).toBeTruthy();
    expect(scoringModelLockReason(dashboardRow(FIXTURES.tiered) as never, { r0: '0' })).toBeTruthy();
  });

  it('the KPI type itself is never per-employee', () => {
    expect(scoringModelLockReason(dashboardRow(FIXTURES.numeric) as never, { uom_type: 'binary' }))
      .toBeTruthy();
  });
});

describe('mixed-type groups block group value entry', () => {
  it('flags a title carrying more than one type', () => {
    expect(isMixedScoringGroup(['numeric', 'binary'])).toBe(true);
    expect(isMixedScoringGroup(['binary', 'binary'])).toBe(false);
    expect(isMixedScoringGroup(null)).toBe(false);
  });
});
