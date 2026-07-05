import { describe, it, expect } from 'vitest';
import { resolveCriteria, type CriterionRow, type CriterionAssignmentRow } from './criteriaLibrary';

const c = (id: string, key: string, patch: Partial<CriterionRow> = {}): CriterionRow => ({
  id, key, label_en: key, label_hi: null, max_score: 5, scoring_bands: [],
  is_common: false, is_active: true, sort_order: 0,
  created_at: null, updated_at: null, ...patch,
} as CriterionRow);

const a = (patch: Partial<CriterionAssignmentRow>): CriterionAssignmentRow => ({
  id: 'x', criterion_id: 'c1',
  archetype_code: null, grade_bucket: null, department_id: null, sub_unit_id: null,
  weight_pct: 10, is_enabled: true, created_at: null, updated_at: null, ...patch,
} as CriterionAssignmentRow);

describe('resolveCriteria — specificity + suppression', () => {
  it('picks the most-specific matching assignment for each criterion', () => {
    const lib = [c('c1', 'attendance')];
    const asg = [
      a({ id: 'w1', criterion_id: 'c1', weight_pct: 5 }),                            // wildcard
      a({ id: 'w2', criterion_id: 'c1', grade_bucket: 'W', weight_pct: 7 }),         // grade only
      a({ id: 'w3', criterion_id: 'c1', grade_bucket: 'W', department_id: 'D1', weight_pct: 10 }), // grade + dept
    ];
    const res = resolveCriteria(lib, asg, { archetype: 'C', grade: 'W', dept: 'D1', subUnit: null });
    expect(res).toHaveLength(1);
    expect(res[0].weight_pct).toBe(10);
  });

  it('omits a criterion when no assignment covers the cell', () => {
    const lib = [c('c1', 'attendance')];
    const asg = [a({ criterion_id: 'c1', department_id: 'D9', weight_pct: 5 })];
    const res = resolveCriteria(lib, asg, { archetype: 'C', grade: 'W', dept: 'D1', subUnit: null });
    expect(res).toHaveLength(0);
  });

  it('suppresses a common question when the most-specific row has is_enabled=false', () => {
    const lib = [c('c1', 'environment', { is_common: true })];
    const asg = [
      a({ id: 'base', criterion_id: 'c1', weight_pct: 5 }),                                        // common everywhere
      a({ id: 'off',  criterion_id: 'c1', grade_bucket: 'M', department_id: 'D1', is_enabled: false }), // remove for D1
    ];
    const inD1 = resolveCriteria(lib, asg, { archetype: 'B', grade: 'M', dept: 'D1', subUnit: null });
    const inD2 = resolveCriteria(lib, asg, { archetype: 'B', grade: 'M', dept: 'D2', subUnit: null });
    expect(inD1).toHaveLength(0);
    expect(inD2).toHaveLength(1);
  });

  it('excludes inactive library criteria', () => {
    const lib = [c('c1', 'x', { is_active: false })];
    const asg = [a({ criterion_id: 'c1' })];
    expect(resolveCriteria(lib, asg, { archetype: null, grade: null, dept: null, subUnit: null })).toHaveLength(0);
  });

  it('orders results by sort_order then label_en', () => {
    const lib = [
      c('c1', 'b', { sort_order: 20, label_en: 'Bravo' }),
      c('c2', 'a', { sort_order: 10, label_en: 'Alpha' }),
    ];
    const asg = [a({ criterion_id: 'c1' }), a({ criterion_id: 'c2' })];
    const res = resolveCriteria(lib, asg, { archetype: null, grade: null, dept: null, subUnit: null });
    expect(res.map((r) => r.key)).toEqual(['a', 'b']);
  });
});
