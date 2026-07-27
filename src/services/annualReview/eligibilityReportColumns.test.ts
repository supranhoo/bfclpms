import { describe, it, expect } from 'vitest';
import {
  buildEligibilityColumnSet, buildEligibilityRow, formatEligibilityCell,
  type EligibilityMaps,
} from './eligibilityReportColumns';
import type { EligibilityCriterion } from '@/types/annualReview';

const tenure: EligibilityCriterion = {
  id: 'tenure', name: '6 Month Completion', type: 'number', operator: 'gte', expected_value: 6,
};
const absent: EligibilityCriterion = {
  id: 'absent', name: 'Absent Days', type: 'number', operator: 'lte', expected_value: 5,
};
const disc: EligibilityCriterion = {
  id: 'disc', name: 'Disciplinary Case', type: 'boolean', operator: 'equals', expected_value: false,
};

const maps: EligibilityMaps = {
  t1: [tenure, absent],
  t2: [{ ...tenure, id: 'ten2', name: ' 6 month completion ' }, disc],
};

describe('eligibility report columns (ADR-181)', () => {
  it('unions questions across templates, de-duplicated by name', () => {
    expect(buildEligibilityColumnSet(['t1', 't2', 't1'], maps).map((c) => c.header))
      .toEqual(['6 Month Completion', 'Absent Days', 'Disciplinary Case']);
  });

  it('renders value, expected condition and verdict', () => {
    expect(formatEligibilityCell(absent, 3).cell).toBe('3 (At most 5) — Pass');
    expect(formatEligibilityCell(absent, 9).cell).toBe('9 (At most 5) — Fail');
  });

  it('renders booleans as Yes/No, never raw operators', () => {
    const out = formatEligibilityCell(disc, false).cell;
    expect(out).toBe('No (No) — Pass');
    expect(out).not.toMatch(/equals|false/);
  });

  it('marks missing answers as Not provided and fails them', () => {
    const v = formatEligibilityCell(tenure, undefined);
    expect(v.cell).toBe('— (At least 6) — Not provided');
    expect(v.passed).toBe(false);
  });

  it('summarises only the failing question names', () => {
    expect(buildEligibilityRow('t1', { tenure: 12, absent: 2 }, maps).summary).toBe('Pass');
    expect(buildEligibilityRow('t1', { tenure: 12, absent: 9 }, maps).summary)
      .toBe('Fail (Absent Days)');
  });

  it('emits one cell per question on the employee template', () => {
    const r = buildEligibilityRow('t1', { tenure: 12, absent: 2 }, maps);
    expect(Object.keys(r.cells)).toEqual(['6 Month Completion', 'Absent Days']);
  });

  it('returns no cells and an em-dash summary when the template has no criteria', () => {
    expect(buildEligibilityRow('t9', { x: 1 }, maps)).toEqual({ cells: {}, summary: '—' });
  });
});