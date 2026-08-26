import { describe, it, expect } from 'vitest';
import {
  diffChanges, hasChanges, weightageDeviations, uniqueByEmployee,
  isMultiMonthFrequency, validateCycleChange, isScopeInert, ladderForType,
} from './groupEditModel';
import { isDescriptiveOnly, isDescriptiveField } from './editFieldClass';

import { directionConflictsWithLadder, buildScoringPayload } from '@/components/admin/kpi-form/kpiFormModel';

const ALLOWED = ['kpi_title', 'weightage', 'target_value', 'r5'];

describe('diffChanges', () => {
  it('emits only fields that actually changed', () => {
    const out = diffChanges(
      { kpi_title: 'Power generation', weightage: 10, target_value: 45 },
      { kpi_title: 'Power generation', weightage: '15', target_value: 45 },
      ALLOWED,
    );
    expect(out).toEqual({ weightage: '15' });
  });

  it('treats empty strings as clearing a value', () => {
    expect(diffChanges({ r5: '>= 45' }, { r5: '  ' }, ALLOWED)).toEqual({ r5: null });
  });

  it('never emits a field outside the whitelist', () => {
    expect(diffChanges({ kpi_name: 'a' }, { kpi_name: 'b' }, ALLOWED)).toEqual({});
  });

  it('reports nothing when the form is untouched', () => {
    expect(hasChanges(diffChanges({ weightage: 10 }, { weightage: '10' }, ALLOWED))).toBe(false);
  });
});

describe('weightageDeviations', () => {
  it('flags only employees who leave 100', () => {
    const rows = [
      { employee_id: 'a', new_total: 100 },
      { employee_id: 'b', new_total: 105 },
      { employee_id: 'c', new_total: 99.995 },
    ];
    expect(weightageDeviations(rows).map(r => r.employee_id)).toEqual(['b']);
  });

  it('handles a missing impact list', () => {
    expect(weightageDeviations(null)).toEqual([]);
  });
});

describe('uniqueByEmployee', () => {
  it('collapses repeated employee entries', () => {
    const rows = [
      { employee_id: 'a', new_total: 90 },
      { employee_id: 'a', new_total: 90 },
      { employee_id: 'b', new_total: 100 },
    ];
    expect(uniqueByEmployee(rows)).toHaveLength(2);
  });
});

// ADR-275 — a frequency change must always travel with its cycle anchor.
describe('ADR-275 cycle anchor validation', () => {
  it('knows which frequencies span several months', () => {
    expect(isMultiMonthFrequency('Quarterly')).toBe(true);
    expect(isMultiMonthFrequency('Bi-Monthly')).toBe(true);
    expect(isMultiMonthFrequency('Monthly')).toBe(false);
    expect(isMultiMonthFrequency(null)).toBe(false);
  });

  it('rejects a multi-month frequency with no anchor', () => {
    expect(validateCycleChange({ frequency: 'Quarterly' })).toMatch(/cycle anchor/i);
    expect(validateCycleChange({ frequency: 'Quarterly', frequency_cycle_start: null })).toMatch(/cycle anchor/i);
  });

  it('accepts a multi-month frequency with an anchor', () => {
    expect(validateCycleChange({ frequency: 'Quarterly', frequency_cycle_start: 'Apr-Jun' })).toBeNull();
  });

  it('rejects an anchor on a single-month frequency', () => {
    expect(validateCycleChange({ frequency: 'Monthly', frequency_cycle_start: 'Jan-Feb' })).toMatch(/cannot carry/i);
    expect(validateCycleChange({ frequency: 'Monthly', frequency_cycle_start: null })).toBeNull();
  });

  it('stays quiet when the frequency is untouched', () => {
    expect(validateCycleChange({ weightage: '10' })).toBeNull();
  });

  it('diffs the newly editable operational fields', () => {
    const changes = diffChanges(
      { frequency: 'Monthly', frequency_cycle_start: null, day_count_type: 'working_days', is_org_level: false },
      { frequency: 'Quarterly', frequency_cycle_start: 'Apr-Jun', day_count_type: 'working_days', is_org_level: 'true' },
      ['frequency', 'frequency_cycle_start', 'day_count_type', 'is_org_level'],
    );
    expect(changes).toEqual({ frequency: 'Quarterly', frequency_cycle_start: 'Apr-Jun', is_org_level: 'true' });
  });
});

// ADR-274a — direction / ladder consistency and forward-only threshold mode.
describe('ADR-274a direction + threshold mode', () => {
  it('flags a "Higher is Better" KPI with a descending ladder', () => {
    expect(directionConflictsWithLadder('Higher is Better', '50', '90')).toBe(true);
    expect(directionConflictsWithLadder('Higher is Better', '90', '50')).toBe(false);
  });

  it('flags a "Lower is Better" KPI with an ascending ladder', () => {
    expect(directionConflictsWithLadder('Lower is Better', '90', '50')).toBe(true);
    expect(directionConflictsWithLadder('Lower is Better', '50', '90')).toBe(false);
  });

  it('stays quiet when the ladder is not numeric, equal, or the direction is unset', () => {
    expect(directionConflictsWithLadder('Higher is Better', 'A', 'B')).toBe(false);
    expect(directionConflictsWithLadder('Higher is Better', '90', '90')).toBe(false);
    expect(directionConflictsWithLadder(null, '50', '90')).toBe(false);
    expect(directionConflictsWithLadder('Equal to Target', '50', '90')).toBe(false);
  });

  it('always writes absolute threshold mode for numeric KPIs, and null for qualitative', () => {
    const numeric = buildScoringPayload({
      uom_type: 'numeric', threshold_mode: 'ratio',
      qualitative_options: null, r5: '100', r4: '', r3: '', r2: '', r1: '', r0: '',
    } as any);
    expect(numeric.threshold_mode).toBe('absolute');

    const binary = buildScoringPayload({
      uom_type: 'binary', threshold_mode: 'ratio',
      qualitative_options: null, r5: '', r4: '', r3: '', r2: '', r1: '', r0: '',
    } as any);
    expect(binary.threshold_mode).toBeNull();
  });

  it('diffs the newly editable structural and direction fields', () => {
    const changes = diffChanges(
      { category_id: 'cat-1', kra_name: 'Old KRA', criteria: 'Lower is Better', source_of_data: null },
      { category_id: 'cat-2', kra_name: 'Old KRA', criteria: 'Higher is Better', source_of_data: 'SAP' },
      ['category_id', 'kra_name', 'criteria', 'source_of_data'],
    );
    expect(Object.keys(changes).sort()).toEqual(['category_id', 'criteria', 'source_of_data']);
  });
});

describe('ADR-326 — no phantom scope changes', () => {
  it('treats scope as inert when the KPI is not and was not org-level', () => {
    expect(isScopeInert(false, false)).toBe(true);
    expect(isScopeInert(false, null)).toBe(true);
    expect(isScopeInert(false, undefined)).toBe(true);
  });

  it('keeps scope live when org-level is on, or is being turned off', () => {
    expect(isScopeInert(true, false)).toBe(false);
    expect(isScopeInert(false, true)).toBe(false);
    expect(isScopeInert(null, false)).toBe(false);
  });

  it('a wording edit stays descriptive-only when the stale scope is not emitted', () => {
    const original = {
      kpi_description: 'old text',
      is_org_level: false,
      org_level_scope: 'organization',
    };
    // scope omitted, per isScopeInert
    const next = { kpi_description: 'new text' };
    const changes = diffChanges(original, next, ['kpi_description', 'org_level_scope']);
    expect(Object.keys(changes)).toEqual(['kpi_description']);
    expect(isDescriptiveOnly(changes)).toBe(true);
  });

  it('a stale scope clear would have poisoned the same edit', () => {
    const original = {
      kpi_description: 'old text',
      is_org_level: false,
      org_level_scope: 'organization',
    };
    const next = { kpi_description: 'new text', org_level_scope: '' };
    const changes = diffChanges(original, next, ['kpi_description', 'org_level_scope']);
    expect(Object.keys(changes).sort()).toEqual(['kpi_description', 'org_level_scope']);
    expect(isDescriptiveOnly(changes)).toBe(false);
  });
});

// ADR-328 — UOM types (Numeric / Binary / Tiered) are respected by the group edit.
describe('ADR-328 — type-aware group edit', () => {
  const LADDER = { r5: '105', r4: '102.5', r3: '100', r2: '97.5', r1: '95', r0: '<95', uom: '%' };

  it('keeps the ladder and unit for a value-based KPI', () => {
    expect(ladderForType('numeric', LADDER)).toEqual(LADDER);
  });

  it('blanks the ladder and unit for Yes/No and tiered KPIs', () => {
    for (const t of ['binary', 'tiered']) {
      expect(ladderForType(t, LADDER)).toEqual({
        r5: '', r4: '', r3: '', r2: '', r1: '', r0: '', uom: '',
      });
    }
  });

  it('emits no inert ladder change when the KPI was already tiered', () => {
    const original = { uom_type: 'tiered', r5: null, r0: null, uom: null, kpi_title: 'A' };
    const next = { uom_type: 'tiered', ...ladderForType('tiered', LADDER), kpi_title: 'B' };
    const changes = diffChanges(original, next, ['uom_type', 'r5', 'r0', 'uom', 'kpi_title']);
    expect(Object.keys(changes)).toEqual(['kpi_title']);
  });

  it('clears a stale numeric ladder when the type switches to Yes/No', () => {
    const original = { uom_type: 'numeric', r5: '105', r0: '<95', uom: '%' };
    const next = { uom_type: 'binary', ...ladderForType('binary', LADDER) };
    const changes = diffChanges(original, next, ['uom_type', 'r5', 'r0', 'uom']);
    expect(changes).toEqual({ uom_type: 'binary', r5: null, r0: null, uom: null });
    // A type switch is never a wording-only run.
    expect(isDescriptiveOnly(changes)).toBe(false);
  });
});

// ADR-327 — the scoring test belongs to the employee scoring profile.
describe('ADR-327 — descriptive allowlist mirrors the server', () => {
  it('excludes the scoring test and the scoring model', () => {
    expect(isDescriptiveField('kpi_scoring_logic')).toBe(false);
    expect(isDescriptiveField('uom_type')).toBe(false);
    expect(isDescriptiveField('target_value')).toBe(false);
  });

  it('still accepts the shared definition wording', () => {
    expect(isDescriptiveOnly({ kpi_title: 'A', kpi_description: 'B', kpi_formula: 'C', uom: '%' })).toBe(true);
  });
});
