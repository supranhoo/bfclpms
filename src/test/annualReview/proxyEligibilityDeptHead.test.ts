import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Regression: HODs who head more than one department across different
 * business units were denied assisted-submission because
 * `annual_review_directory_access` collapses a head to a single BU via
 * `LIMIT 1`. `can_proxy_submit_annual_review` now short-circuits on direct
 * dept/BU headship BEFORE consulting the directory resolver.
 *
 * See POLICY §Assisted Submission Eligibility and ADR-107.
 */
describe('can_proxy_submit_annual_review — direct dept/BU head branch', () => {
  const migration = fs.readFileSync(
    path.resolve(__dirname, '../../../supabase/migrations/20260717083811_dc20e272-9dc9-4d8d-aae1-41113aa2240a.sql'),
    'utf8',
  );

  it('checks the employee_id department against departments.head_user_id', () => {
    expect(migration).toMatch(/Direct head of the employee's department/i);
    expect(migration).toMatch(/FROM public\.departments[\s\S]*head_user_id = _proxy_user_id[\s\S]*id = v_emp_dept/);
  });

  it('checks the employee BU headship (BU itself or any dept in that BU)', () => {
    expect(migration).toMatch(/Direct head of the employee's business unit/i);
    expect(migration).toMatch(/business_units WHERE id = v_emp_bu AND head_user_id = _proxy_user_id/);
    expect(migration).toMatch(/departments\s+WHERE business_unit_id = v_emp_bu AND head_user_id = _proxy_user_id/);
  });

  it('runs the direct-headship branches BEFORE the directory_access fallback', () => {
    const deptHeadIdx = migration.indexOf("Direct head of the employee's department");
    const dirAccessIdx = migration.indexOf('annual_review_directory_access(_proxy_user_id)');
    expect(deptHeadIdx).toBeGreaterThan(-1);
    expect(dirAccessIdx).toBeGreaterThan(deptHeadIdx);
  });

  it('preserves the pre-existing eligibility branches (manager, skip, designated, admin, hr_pms)', () => {
    expect(migration).toMatch(/_proxy_user_id = v_manager_id/);
    expect(migration).toMatch(/_proxy_user_id = v_skip_id/);
    expect(migration).toMatch(/_proxy_user_id = v_designated/);
    expect(migration).toMatch(/has_role\(_proxy_user_id, 'admin'::app_role\)/);
    expect(migration).toMatch(/has_role\(_proxy_user_id, 'hr_pms'::app_role\)/);
  });

  it('preserves the employee-never-signed-in guard', () => {
    expect(migration).toMatch(/v_employee_email IS NOT NULL AND v_employee_last_signin IS NOT NULL/);
  });
});