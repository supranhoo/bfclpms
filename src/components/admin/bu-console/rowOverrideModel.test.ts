/** ADR-282 — per-employee tuning must never fork a KPI's scoring model. */
import { describe, it, expect } from 'vitest';
import {
  rowEditableFields, isQualitativeKpi, scoringModelLockReason,
} from './rowOverrideModel';

const numeric = { uom_type: 'numeric', r5: '100', r0: '0' };
const binary = {
  uom_type: 'binary',
  qualitative_options: [
    { label: 'Yes', rating: 0 },
    { label: 'No', rating: 5 },
  ],
};
const tiered = {
  uom_type: 'tiered',
  qualitative_options: [{ label: 'Full', rating: 5 }, { label: 'Partial', rating: 3 }],
};

describe('rowEditableFields', () => {
  it('keeps the ladder, unit and direction for value-based KPIs', () => {
    const f = rowEditableFields(numeric);
    expect(f).toContain('r5');
    expect(f).toContain('uom');
    expect(f).toContain('criteria');
    expect(f).toContain('weightage');
  });

  it('drops the ladder, unit and direction for Yes/No and tiered KPIs', () => {
    for (const kpi of [binary, tiered]) {
      const f = rowEditableFields(kpi);
      expect(f).toEqual(expect.arrayContaining(['weightage', 'target_value', 'frequency']));
      for (const banned of ['r5', 'r4', 'r3', 'r2', 'r1', 'r0', 'uom', 'criteria']) {
        expect(f).not.toContain(banned);
      }
    }
  });

  it('treats a missing uom_type as value based', () => {
    expect(isQualitativeKpi({})).toBe(false);
    expect(isQualitativeKpi(binary)).toBe(true);
  });
});

describe('scoringModelLockReason', () => {
  it('allows scope-only tuning on every type', () => {
    expect(scoringModelLockReason(binary, { weightage: '5' })).toBeNull();
    expect(scoringModelLockReason(numeric, { target_value: '90' })).toBeNull();
  });

  it('allows the ladder only for value-based KPIs', () => {
    expect(scoringModelLockReason(numeric, { r5: '95' })).toBeNull();
    expect(scoringModelLockReason(binary, { r5: '95' })).not.toBeNull();
    expect(scoringModelLockReason(tiered, { criteria: 'Increase is better' })).not.toBeNull();
  });

  it('never allows the type or its options per employee', () => {
    expect(scoringModelLockReason(numeric, { uom_type: 'binary' })).not.toBeNull();
    expect(scoringModelLockReason(numeric, { qualitative_options: '[]' })).not.toBeNull();
  });

  it('is a no-op for an empty change set', () => {
    expect(scoringModelLockReason(binary, {})).toBeNull();
  });
});
