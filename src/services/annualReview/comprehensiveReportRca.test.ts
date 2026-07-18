import { describe, it, expect } from 'vitest';
import { diagnoseHr, type ComprehensiveRow } from './comprehensiveReport';

const base: ComprehensiveRow = {
  instance_id: 'i', employee_id: 'e', employee_code: '1', employee_name: 'X',
  designation: null, department_id: null, department_name: null,
  business_unit_id: null, business_unit_name: null, division_id: null, division_name: null,
  grade: null, doj: null, overall_status: 'pending_hr', is_excluded: false, excluded_reason: null,
  enabled_stages: ['self','manager','hr'], self_score: null, manager_score: null,
  dept_head_score: null, bu_head_score: null, hr_score: null, total_score: null,
  final_rating: null, finalized_at: null, updated_at: null, days_pending: 0,
  manager_name: null, dept_head_name: null, bu_head_name: null, hr_name: null,
  self_comment: null, manager_comment: null, dept_head_comment: null, bu_head_comment: null, hr_comment: null,
  hr_stage_enabled: true, hr_response_exists: false, hr_response_submitted_at: null,
  manager_id: null, dept_head_id: null, bu_head_id: null, hr_id: 'hr-uuid',
  cycle_default_stages: ['self','manager','hr'],
};

describe('diagnoseHr', () => {
  it('OK when HR score present', () => {
    const d = diagnoseHr({ ...base, hr_response_exists: true, hr_score: 85, hr_response_submitted_at: 't' });
    expect(d.root_cause).toBe('OK');
    expect(d.hr_data_visible).toBe(true);
  });
  it('Not Started when HR stage not enabled', () => {
    const d = diagnoseHr({ ...base, hr_stage_enabled: false, enabled_stages: ['self','manager'], cycle_default_stages: ['self','manager'] });
    expect(d.root_cause).toBe('HR Review Not Started');
  });
  it('Data Not Mapped when hr_id null', () => {
    const d = diagnoseHr({ ...base, hr_id: null });
    expect(d.root_cause).toBe('HR Data Not Mapped');
  });
  it('Pending when at HR with no response', () => {
    const d = diagnoseHr({ ...base, overall_status: 'pending_hr' });
    expect(d.root_cause).toBe('HR Review Pending');
  });
  it('Not Submitted when response exists but no submitted_at', () => {
    const d = diagnoseHr({ ...base, hr_response_exists: true, hr_response_submitted_at: null });
    expect(d.root_cause).toBe('HR Review Not Submitted');
  });
  it('Migration issue when submitted but score null', () => {
    const d = diagnoseHr({ ...base, hr_response_exists: true, hr_response_submitted_at: 't', hr_score: null });
    expect(d.root_cause).toBe('Data Migration Issue');
  });
});
