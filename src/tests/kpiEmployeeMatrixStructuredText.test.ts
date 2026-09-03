import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveMatrixKpiText, matrixRowKey, normalizeMatrixKey } from '@/lib/reports/kpiMatrixText';

describe('ADR-358 — KPI-Employee Matrix structured text', () => {
  it('uses the structured columns when present', () => {
    const t = resolveMatrixKpiText({
      kra_name: 'Power',
      kpi_name: 'Achieve target .: - Formula: A/B - Scoring Logic: tiered',
      kpi_title: 'Achieve 1050 TPD Power Generation target',
      kpi_description: 'Generate power as per plan',
      kpi_formula: 'Actual / Plan x 100',
      kpi_scoring_logic: '>=100% = 5',
    });
    expect(t.isStructured).toBe(true);
    expect(t.title).toBe('Achieve 1050 TPD Power Generation target');
    expect(t.description).toBe('Generate power as per plan');
    expect(t.formula).toBe('Actual / Plan x 100');
    expect(t.scoringLogic).toBe('>=100% = 5');
  });

  it('falls back to splitting the legacy kpi_name', () => {
    const t = resolveMatrixKpiText({
      kra_name: 'Cost',
      kpi_name: 'Consumable cost\n- Formula: spend/tonne\n- Scoring Logic: lower is better',
    });
    expect(t.isStructured).toBe(false);
    expect(t.title).toBe('Consumable cost');
    expect(t.formula).toBe('spend/tonne');
    expect(t.scoringLogic).toBe('lower is better');
  });

  it('falls back to the raw legacy name when unparsed, and keeps criteria as description', () => {
    const t = resolveMatrixKpiText({
      kra_name: 'Ops',
      kpi_name: 'Plant uptime',
      description: 'legacy criteria text',
    });
    expect(t.title).toBe('Plant uptime');
    expect(t.description).toBe('legacy criteria text');
    expect(t.formula).toBe('');
  });

  it('collapses legacy variants that resolve to the same title', () => {
    const a = resolveMatrixKpiText({ kra_name: 'Power', kpi_name: 'Power generation from 8 MWh' });
    const b = resolveMatrixKpiText({
      kra_name: 'Power',
      kpi_name: 'Power generation from 8 MWh  - Formula: X',
      kpi_title: 'Power generation from 8 MWh',
    });
    expect(matrixRowKey('cat-1', 'Power', a.title)).toBe(matrixRowKey('cat-1', 'Power', b.title));
  });

  it('keeps different categories apart', () => {
    expect(matrixRowKey('cat-1', 'Power', 'X')).not.toBe(matrixRowKey('cat-2', 'Power', 'X'));
    expect(normalizeMatrixKey('  A   B ')).toBe('a b');
  });

  it('exposes the four structured columns in the report field registry', () => {
    const src = readFileSync('src/pages/reports/KpiEmployeeMatrix.tsx', 'utf8');
    for (const key of ['kpi_title', 'kpi_description', 'kpi_formula', 'kpi_scoring_logic']) {
      expect(src).toContain(`field_key: '${key}'`);
      expect(src).toContain(`case '${key}':`);
    }
  });
});
