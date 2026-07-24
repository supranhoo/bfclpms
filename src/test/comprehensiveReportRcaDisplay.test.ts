import { describe, it, expect } from 'vitest';
import {
  stageRatingDisplay,
  isSystemScoredOnly,
  type ComprehensiveRow,
} from '@/services/annualReview/comprehensiveReport';

/**
 * ADR-155 — Employee RCA card must not label a stage "Below Expectations"
 * just because its numeric score is 0 with no reviewer signal, and must
 * suppress a duplicated HOD row when dept_head == bu_head.
 */

const baseRow = (over: Partial<ComprehensiveRow> = {}): ComprehensiveRow => ({
  instance_id: 'i1', employee_id: 'e1',
  employee_code: '101785', employee_name: 'Ankit',
  designation: null, department_id: null, department_name: null,
  business_unit_id: null, business_unit_name: null,
  division_id: null, division_name: null,
  grade: null, doj: null,
  overall_status: 'completed', is_excluded: false, excluded_reason: null,
  enabled_stages: ['self', 'dept_head', 'bu_head'],
  self_score: 0, manager_score: null, dept_head_score: null,
  bu_head_score: 0, hr_score: null, management_score: null,
  total_score: 91.72, final_rating: 'Outstanding',
  finalized_at: null, updated_at: null, days_pending: null,
  manager_name: null, dept_head_name: 'Jaspal', bu_head_name: 'Jaspal',
  hr_name: null, management_name: null,
  self_comment: null, manager_comment: null,
  dept_head_comment: null, bu_head_comment: null,
  hr_comment: null, management_comment: null,
  hr_stage_enabled: false, hr_response_exists: false, hr_response_submitted_at: null,
  manager_id: null,
  dept_head_id: 'reviewer-jaspal',
  bu_head_id: 'reviewer-jaspal',
  hr_id: null, management_id: null,
  cycle_default_stages: null,
  ...over,
});

describe('stageRatingDisplay (ADR-155)', () => {
  it('returns — for score 0 with no comment (no reviewer signal)', () => {
    expect(stageRatingDisplay(0, null)).toBe('—');
    expect(stageRatingDisplay(0, '')).toBe('—');
    expect(stageRatingDisplay(0, '   ')).toBe('—');
  });
  it('returns — for null score', () => {
    expect(stageRatingDisplay(null, null)).toBe('—');
    expect(stageRatingDisplay(null, 'irrelevant')).toBe('—');
  });
  it('buckets a real score to a rating label', () => {
    expect(stageRatingDisplay(91.72, null)).toBe('Outstanding');
    expect(stageRatingDisplay(75, null)).toBe('Meets Expectations');
  });
  it('buckets an active 0 when the reviewer left a comment', () => {
    expect(stageRatingDisplay(0, 'Non-performer')).toBe('Below Expectations');
  });
});

describe('isSystemScoredOnly (ADR-155)', () => {
  it('true for Ankit-shaped rows (self blank, final > 0)', () => {
    expect(isSystemScoredOnly(baseRow())).toBe(true);
  });
  it('false when self carries any signal', () => {
    expect(isSystemScoredOnly(baseRow({ self_score: 72 }))).toBe(false);
    expect(isSystemScoredOnly(baseRow({ self_comment: 'note' }))).toBe(false);
  });
  it('false when final total is 0 too (fully-blank / not-started)', () => {
    expect(isSystemScoredOnly(baseRow({ total_score: 0 }))).toBe(false);
  });
});

describe('dept=BU collapse (row-level predicate)', () => {
  const collapsed = (r: ComprehensiveRow) =>
    !!r.dept_head_id && !!r.bu_head_id && r.dept_head_id === r.bu_head_id;

  it('true when dept_head_id equals bu_head_id', () => {
    expect(collapsed(baseRow())).toBe(true);
  });
  it('false when reviewers differ', () => {
    expect(collapsed(baseRow({ dept_head_id: 'other-hod' }))).toBe(false);
  });
  it('false when either id is missing', () => {
    expect(collapsed(baseRow({ dept_head_id: null }))).toBe(false);
    expect(collapsed(baseRow({ bu_head_id: null }))).toBe(false);
  });
});