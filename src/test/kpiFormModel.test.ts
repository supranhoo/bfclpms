import { describe, it, expect } from 'vitest';
import {
  buildScoringPayload,
  buildTextPayload,
  textStateFromRow,
  validateScoringState,
  binaryOptionsFor,
  KpiScoringState,
} from '@/components/admin/kpi-form/kpiFormModel';

const numericState = (over: Partial<KpiScoringState> = {}): KpiScoringState => ({
  uom_type: 'numeric',
  threshold_mode: 'absolute',
  qualitative_options: [],
  r5: '100', r4: '90', r3: '80', r2: '70', r1: '60', r0: '',
  ...over,
});

describe('kpiFormModel — shared Assign/Editor parity (ADR-272)', () => {
  it('nulls threshold columns for qualitative KPIs', () => {
    const payload = buildScoringPayload(numericState({ uom_type: 'binary', qualitative_options: binaryOptionsFor(false) }));
    expect(payload.r5).toBeNull();
    expect(payload.threshold_mode).toBeNull();
    expect(payload.qualitative_options).toHaveLength(2);
  });

  it('keeps numeric thresholds and drops qualitative options for numeric KPIs', () => {
    const payload = buildScoringPayload(numericState());
    expect(payload.r5).toBe('100');
    expect(payload.r0).toBeNull();
    expect(payload.qualitative_options).toBeNull();
  });

  it('preserves legacy kpi_name when the text is not split', () => {
    const payload = buildTextPayload(textStateFromRow({ kpi_name: 'Documentation' }));
    expect(payload.kpi_name).toBe('Documentation');
    expect(payload.kpi_title).toBeNull();
  });

  it('recomposes kpi_name from structured parts so historical joins keep matching', () => {
    const payload = buildTextPayload({
      kpi_name: 'legacy',
      kpi_title: 'Dust Emission',
      kpi_description: 'Keep stack emission within limit',
      kpi_formula: 'avg(mg/Nm3)',
      kpi_scoring_logic: '≤30 = R5',
    });
    expect(payload.kpi_title).toBe('Dust Emission');
    expect(payload.kpi_name).toContain('Dust Emission');
    expect(payload.kpi_name).toContain('≤30 = R5');
  });

  it('rejects binary KPIs without exactly two options', () => {
    expect(validateScoringState(numericState({ uom_type: 'binary', qualitative_options: [] }))).toBeTruthy();
    expect(validateScoringState(numericState({ uom_type: 'binary', qualitative_options: binaryOptionsFor(true) }))).toBeNull();
  });

  it('accepts valid numeric state', () => {
    expect(validateScoringState(numericState())).toBeNull();
  });
});
