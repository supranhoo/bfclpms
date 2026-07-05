import { describe, it, expect } from 'vitest';
import {
  matchesFilters,
  resolveTemplateForProfile,
  type MappingProfile,
} from './formMapping';
import type { AnnualReviewAssignmentRule } from '@/types/annualReview';

const p = (over: Partial<MappingProfile> = {}): MappingProfile => ({
  id: 'p1',
  full_name: 'Alice',
  employee_code: 'E001',
  designation: 'Executive',
  pms_grade: 'M4',
  level: 'L3',
  department_id: 'd1',
  ...over,
});

const deptToBu: Record<string, string | null> = { d1: 'bu1', d2: 'bu2', d3: null };

describe('matchesFilters', () => {
  it('empty filter set matches every employee', () => {
    expect(matchesFilters({}, p(), deptToBu)).toBe(true);
    expect(matchesFilters(null, p(), deptToBu)).toBe(true);
  });
  it('matches on designation / grade / level / dept exactly', () => {
    expect(matchesFilters({ roles: ['Executive'] }, p(), deptToBu)).toBe(true);
    expect(matchesFilters({ roles: ['Manager'] }, p(), deptToBu)).toBe(false);
    expect(matchesFilters({ grades: ['M4', 'M5'] }, p(), deptToBu)).toBe(true);
    expect(matchesFilters({ grades: ['W1'] }, p(), deptToBu)).toBe(false);
    expect(matchesFilters({ levels: ['L3'] }, p(), deptToBu)).toBe(true);
    expect(matchesFilters({ department_ids: ['d1'] }, p(), deptToBu)).toBe(true);
    expect(matchesFilters({ department_ids: ['d2'] }, p(), deptToBu)).toBe(false);
  });
  it('BU filter joins via department → business_unit_id', () => {
    expect(matchesFilters({ bu_ids: ['bu1'] }, p(), deptToBu)).toBe(true);
    expect(matchesFilters({ bu_ids: ['bu2'] }, p(), deptToBu)).toBe(false);
    // dept with no BU → BU filter rejects
    expect(matchesFilters({ bu_ids: ['bu1'] }, p({ department_id: 'd3' }), deptToBu)).toBe(false);
    // employee with no dept → BU filter rejects
    expect(matchesFilters({ bu_ids: ['bu1'] }, p({ department_id: null }), deptToBu)).toBe(false);
  });
  it('AND-combines all provided facets', () => {
    const ok = matchesFilters(
      { roles: ['Executive'], grades: ['M4'], department_ids: ['d1'] },
      p(), deptToBu,
    );
    const fail = matchesFilters(
      { roles: ['Executive'], grades: ['W1'] },
      p(), deptToBu,
    );
    expect(ok).toBe(true);
    expect(fail).toBe(false);
  });
  it('null profile fields are treated as empty strings', () => {
    expect(
      matchesFilters({ roles: [''] }, p({ designation: null }), deptToBu),
    ).toBe(true);
  });
});

describe('resolveTemplateForProfile', () => {
  const rule = (over: Partial<AnnualReviewAssignmentRule>): AnnualReviewAssignmentRule => ({
    id: 'r', template_id: 't', cycle_id: 'c', name: null, priority: 100,
    filters: { roles: [], grades: [], levels: [], bu_ids: [], department_ids: [] },
    is_active: true, created_by: null, created_at: '', updated_at: '',
    ...over,
  });

  it('returns null when no rules', () => {
    expect(resolveTemplateForProfile([], p(), deptToBu).templateId).toBeNull();
  });
  it('lower priority number wins', () => {
    const r1 = rule({ id: 'r1', template_id: 't-low', priority: 50 });
    const r2 = rule({ id: 'r2', template_id: 't-high', priority: 10 });
    expect(resolveTemplateForProfile([r1, r2], p(), deptToBu).templateId).toBe('t-high');
  });
  it('inactive rules are ignored', () => {
    const r = rule({ template_id: 't1', priority: 1, is_active: false });
    expect(resolveTemplateForProfile([r], p(), deptToBu).templateId).toBeNull();
  });
  it('most-specific first-match wins by priority, not specificity', () => {
    const broad = rule({ id: 'b', template_id: 'broad', priority: 5, filters: { ...rule({}).filters } });
    const narrow = rule({ id: 'n', template_id: 'narrow', priority: 20, filters: { ...rule({}).filters, roles: ['Executive'] } });
    expect(resolveTemplateForProfile([broad, narrow], p(), deptToBu).templateId).toBe('broad');
  });
  it('skips non-matching rules and picks next', () => {
    const miss = rule({ id: 'm', template_id: 'x', priority: 1, filters: { ...rule({}).filters, roles: ['Manager'] } });
    const hit  = rule({ id: 'h', template_id: 'y', priority: 5, filters: { ...rule({}).filters, roles: ['Executive'] } });
    expect(resolveTemplateForProfile([miss, hit], p(), deptToBu).templateId).toBe('y');
  });
});