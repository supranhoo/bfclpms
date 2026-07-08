import { describe, it, expect } from 'vitest';
import {
  matchesFilters,
  resolveTemplateForProfile,
  windowMonthsFromFilters,
  DEFAULT_KRAS_WINDOW_MONTHS,
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
  it('matches grade_bucket by PMS grade prefix', () => {
    expect(matchesFilters({ grade_bucket: 'M' }, p({ pms_grade: 'M4' }), deptToBu)).toBe(true);
    expect(matchesFilters({ grade_bucket: 'W' }, p({ pms_grade: 'M4' }), deptToBu)).toBe(false);
    expect(matchesFilters({ grade_bucket: 'W' }, p({ pms_grade: 'Workman' }), deptToBu)).toBe(true);
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

  describe('has_kras filter', () => {
    const krasSet = new Set<string>(['p1']);

    it('undefined has_kras is backward-compatible (no restriction)', () => {
      expect(matchesFilters({}, p({ id: 'p1' }), deptToBu, krasSet)).toBe(true);
      expect(matchesFilters({}, p({ id: 'other' }), deptToBu, krasSet)).toBe(true);
    });
    it("has_kras='any' behaves like undefined", () => {
      expect(matchesFilters({ has_kras: 'any' }, p({ id: 'other' }), deptToBu, krasSet)).toBe(true);
    });
    it("has_kras='yes' keeps only employees in the KRA set", () => {
      expect(matchesFilters({ has_kras: 'yes' }, p({ id: 'p1' }), deptToBu, krasSet)).toBe(true);
      expect(matchesFilters({ has_kras: 'yes' }, p({ id: 'other' }), deptToBu, krasSet)).toBe(false);
    });
    it("has_kras='no' inverts the membership check", () => {
      expect(matchesFilters({ has_kras: 'no' }, p({ id: 'p1' }), deptToBu, krasSet)).toBe(false);
      expect(matchesFilters({ has_kras: 'no' }, p({ id: 'other' }), deptToBu, krasSet)).toBe(true);
    });
    it('has_kras is treated as satisfied if caller omits the set (preview short-circuit)', () => {
      expect(matchesFilters({ has_kras: 'yes' }, p({ id: 'other' }), deptToBu)).toBe(true);
    });
  });
});

describe('windowMonthsFromFilters', () => {
  it('defaults to 12 when unset / invalid', () => {
    expect(windowMonthsFromFilters(undefined)).toBe(DEFAULT_KRAS_WINDOW_MONTHS);
    expect(windowMonthsFromFilters({})).toBe(12);
    expect(windowMonthsFromFilters({ kras_window_months: 0 })).toBe(12);
    expect(windowMonthsFromFilters({ kras_window_months: -3 })).toBe(12);
    expect(windowMonthsFromFilters({ kras_window_months: NaN as unknown as number })).toBe(12);
  });
  it('clamps to 1..36 and rounds', () => {
    expect(windowMonthsFromFilters({ kras_window_months: 3 })).toBe(3);
    expect(windowMonthsFromFilters({ kras_window_months: 6.7 })).toBe(7);
    expect(windowMonthsFromFilters({ kras_window_months: 99 })).toBe(36);
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
  it('uses workbook grade_bucket filters during rule resolution', () => {
    const workbook = rule({
      id: 'workbook', template_id: 'workbook-w', priority: 1,
      filters: { ...rule({}).filters, grade_bucket: 'W' },
    });
    expect(resolveTemplateForProfile([workbook], p({ pms_grade: 'M4' }), deptToBu).templateId).toBeNull();
    expect(resolveTemplateForProfile([workbook], p({ pms_grade: 'Workman' }), deptToBu).templateId).toBe('workbook-w');
  });

  it('newly-added rule with lower priority number wins over older broad rule', () => {
    // Regression: the Audience Builder used to save new rules at the
    // HIGHEST priority number (least precedence), so specific new rules
    // were shadowed by older broad rules and resolved 0 employees.
    const oldBroad = rule({
      id: 'old', template_id: 'broad', priority: 100,
      filters: { ...rule({}).filters },
    });
    const newSpecific = rule({
      id: 'new', template_id: 'specific', priority: 99, // min(existing)-1
      filters: { ...rule({}).filters, roles: ['Executive'] },
    });
    expect(
      resolveTemplateForProfile([oldBroad, newSpecific], p(), deptToBu).templateId,
    ).toBe('specific');
  });

  it('equal-priority rules resolve deterministically by id (defence in depth)', () => {
    // Same priority — without a tie-break the winner would depend on DB row
    // order. The resolver falls back to lexicographic id order, so the same
    // set of rules always produces the same template.
    const a = rule({ id: 'aaa', template_id: 't-a', priority: 1 });
    const b = rule({ id: 'bbb', template_id: 't-b', priority: 1 });
    expect(resolveTemplateForProfile([b, a], p(), deptToBu).templateId).toBe('t-a');
    expect(resolveTemplateForProfile([a, b], p(), deptToBu).templateId).toBe('t-a');
  });

  it('newly-saved rule with priority=0 beats existing rules clamped at 1', () => {
    // Regression: Math.max(1, min-10) clamped every new rule to priority 1
    // once any existing rule was already at 1, producing a tie the older
    // rule won. The fixed formula (minExisting - 1) allows 0 / negative
    // priorities so new rules always strictly outrank existing ones.
    const oldAtOne = rule({
      id: 'old', template_id: 'broad', priority: 1,
      filters: { ...rule({}).filters },
    });
    const fresh = rule({
      id: 'new', template_id: 'specific', priority: 0, // minExisting(1) - 1
      filters: { ...rule({}).filters, roles: ['Executive'] },
    });
    expect(
      resolveTemplateForProfile([oldAtOne, fresh], p(), deptToBu).templateId,
    ).toBe('specific');
  });
});

describe('employee_ids audience (POLICY §AR-MAPPING-EMPLOYEE-IDS)', () => {
  it("employee_ids_mode='only' matches ONLY listed ids and ignores facet filters", () => {
    // roles filter would normally reject; 'only' short-circuits it.
    expect(
      matchesFilters(
        { roles: ['Manager'], employee_ids: ['p1'], employee_ids_mode: 'only' },
        p({ id: 'p1', designation: 'Executive' }),
        deptToBu,
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        { roles: ['Manager'], employee_ids: ['other'], employee_ids_mode: 'only' },
        p({ id: 'p1', designation: 'Executive' }),
        deptToBu,
      ),
    ).toBe(false);
  });

  it("employee_ids_mode='union' matches (filter-match) OR (id-in-list)", () => {
    // Facet mismatch — but id in list → keep.
    expect(
      matchesFilters(
        { roles: ['Manager'], employee_ids: ['p1'], employee_ids_mode: 'union' },
        p({ id: 'p1', designation: 'Executive' }),
        deptToBu,
      ),
    ).toBe(true);
    // Facet match + id NOT in list → still keep.
    expect(
      matchesFilters(
        { roles: ['Executive'], employee_ids: ['other'], employee_ids_mode: 'union' },
        p({ id: 'p1', designation: 'Executive' }),
        deptToBu,
      ),
    ).toBe(true);
    // Facet mismatch + id NOT in list → reject.
    expect(
      matchesFilters(
        { roles: ['Manager'], employee_ids: ['other'], employee_ids_mode: 'union' },
        p({ id: 'p1', designation: 'Executive' }),
        deptToBu,
      ),
    ).toBe(false);
  });

  it('undefined employee_ids_mode = legacy filter-only behaviour (regression guard)', () => {
    // employee_ids present but mode undefined → ignored entirely.
    expect(
      matchesFilters(
        { roles: ['Executive'], employee_ids: ['other'] },
        p({ id: 'p1', designation: 'Executive' }),
        deptToBu,
      ),
    ).toBe(true);
    expect(
      matchesFilters(
        { roles: ['Manager'], employee_ids: ['p1'] },
        p({ id: 'p1', designation: 'Executive' }),
        deptToBu,
      ),
    ).toBe(false);
  });
});