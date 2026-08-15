import { describe, it, expect } from 'vitest';
import { diffChanges, hasChanges, weightageDeviations, uniqueByEmployee } from './groupEditModel';

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
