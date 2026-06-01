import { describe, it, expect } from 'vitest';
import {
  parseRequirements,
  validateRequiredFields,
  DEFAULT_REQUIREMENTS,
  EMPLOYEE_MASTER_FIELDS,
} from './employeeMasterFields';

describe('employeeMasterFields', () => {
  it('defaults: only full_name + employee_code are mandatory', () => {
    expect(DEFAULT_REQUIREMENTS.full_name).toBe(true);
    expect(DEFAULT_REQUIREMENTS.employee_code).toBe(true);
    expect(DEFAULT_REQUIREMENTS.email).toBe(false);
    expect(DEFAULT_REQUIREMENTS.department_id).toBe(false);
  });

  it('parseRequirements merges saved values over defaults', () => {
    const r = parseRequirements({ email: true, department_id: true });
    expect(r.email).toBe(true);
    expect(r.department_id).toBe(true);
    expect(r.designation).toBe(false);
  });

  it('parseRequirements always forces alwaysRequired keys true', () => {
    const r = parseRequirements({ full_name: false, employee_code: false });
    expect(r.full_name).toBe(true);
    expect(r.employee_code).toBe(true);
  });

  it('parseRequirements is tolerant of null/garbage', () => {
    expect(parseRequirements(null).full_name).toBe(true);
    expect(parseRequirements('nope').employee_code).toBe(true);
  });

  it('validateRequiredFields: ok when all mandatory fields present', () => {
    const reqs = parseRequirements({ email: true });
    const r = validateRequiredFields(
      { full_name: 'A', employee_code: 'E1', email: 'a@b.co' },
      reqs,
    );
    expect(r.ok).toBe(true);
  });

  it('validateRequiredFields: fails on blank mandatory field', () => {
    const reqs = parseRequirements({ department_id: true });
    const r = validateRequiredFields(
      { full_name: 'A', employee_code: 'E1', department_id: '' },
      reqs,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldKey).toBe('department_id');
      expect(r.message).toBe('Department is mandatory.');
    }
  });

  it('validateRequiredFields: whitespace counts as blank', () => {
    const reqs = parseRequirements({});
    const r = validateRequiredFields({ full_name: '   ', employee_code: 'E1' }, reqs);
    expect(r.ok).toBe(false);
  });

  it('all 18 fields are listed', () => {
    expect(EMPLOYEE_MASTER_FIELDS.length).toBe(18);
  });
});