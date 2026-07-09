import { describe, it, expect } from 'vitest';
import {
  resolveEligibleEmployeeIdsForTemplates,
  type SeededInstance,
} from '@/lib/annualReviewTemplateAudience';
import type { MappingProfile } from '@/services/annualReview/formMapping';
import type { AnnualReviewAssignmentRule } from '@/types/annualReview';

const TPL_M = 'tpl-m';
const TPL_W = 'tpl-w';
const TPL_OTHER = 'tpl-other';

function profile(overrides: Partial<MappingProfile>): MappingProfile {
  return {
    id: 'e?',
    full_name: null,
    employee_code: null,
    designation: null,
    pms_grade: null,
    level: null,
    department_id: null,
    ...overrides,
  };
}

// Two active rules:
//   priority 10 → grade bucket M → TPL_M
//   priority 20 → grade bucket W → TPL_W
const RULES: AnnualReviewAssignmentRule[] = [
  {
    id: 'r1',
    cycle_id: 'c1',
    template_id: TPL_M,
    priority: 10,
    is_active: true,
    filters: { grade_bucket: 'M' } as any,
  } as any,
  {
    id: 'r2',
    cycle_id: 'c1',
    template_id: TPL_W,
    priority: 20,
    is_active: true,
    filters: { grade_bucket: 'W' } as any,
  } as any,
];

describe('resolveEligibleEmployeeIdsForTemplates', () => {
  const profiles: MappingProfile[] = [
    profile({ id: 'e-seeded-match',   pms_grade: 'M4' }), // seeded to TPL_M
    profile({ id: 'e-seeded-other',   pms_grade: 'M4' }), // seeded to TPL_OTHER (excluded)
    profile({ id: 'e-unseeded-match', pms_grade: 'M4' }), // no instance, rule → TPL_M
    profile({ id: 'e-unseeded-w',     pms_grade: 'W3' }), // no instance, rule → TPL_W
    profile({ id: 'e-unmapped',       pms_grade: null }), // no instance, no rule match
  ];
  const seededByEmp = new Map<string, SeededInstance>([
    ['e-seeded-match', { template_id: TPL_M, template_override_id: null }],
    ['e-seeded-other', { template_id: TPL_OTHER, template_override_id: null }],
  ]);

  it('returns empty when no template selected', () => {
    const got = resolveEligibleEmployeeIdsForTemplates({
      profiles, rules: RULES, deptToBu: {}, krasSets: null, seededByEmp,
      templateIds: [],
    });
    expect(got.size).toBe(0);
  });

  it('includes both seeded-matches AND rule-predicted unseeded employees', () => {
    const got = resolveEligibleEmployeeIdsForTemplates({
      profiles, rules: RULES, deptToBu: {}, krasSets: null, seededByEmp,
      templateIds: [TPL_M],
    });
    expect([...got].sort()).toEqual(['e-seeded-match', 'e-unseeded-match']);
  });

  it('respects the union over multiple selected templates', () => {
    const got = resolveEligibleEmployeeIdsForTemplates({
      profiles, rules: RULES, deptToBu: {}, krasSets: null, seededByEmp,
      templateIds: [TPL_M, TPL_W],
    });
    expect([...got].sort()).toEqual(
      ['e-seeded-match', 'e-unseeded-match', 'e-unseeded-w'].sort(),
    );
  });

  it('excludes seeded employees whose seeded template does not match', () => {
    const got = resolveEligibleEmployeeIdsForTemplates({
      profiles, rules: RULES, deptToBu: {}, krasSets: null, seededByEmp,
      templateIds: [TPL_OTHER],
    });
    expect([...got]).toEqual(['e-seeded-other']);
  });

  it('honours override precedence when both seeded ids are present', () => {
    const got = resolveEligibleEmployeeIdsForTemplates({
      profiles: [profile({ id: 'e-override', pms_grade: 'M4' })],
      rules: RULES,
      deptToBu: {},
      krasSets: null,
      seededByEmp: new Map([
        ['e-override', { template_id: TPL_M, template_override_id: TPL_OTHER }],
      ]),
      templateIds: [TPL_OTHER],
    });
    expect([...got]).toEqual(['e-override']);
  });
});