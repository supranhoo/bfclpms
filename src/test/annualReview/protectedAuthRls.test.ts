import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260724185442_d6a463cf-a243-4792-b168-01e7b1fb37fe.sql'),
  'utf8',
);

describe('ADR-163 Annual Review protected-auth RLS repair', () => {
  it('keeps protected auth-table access behind a minimal security-definer helper', () => {
    expect(migration).toMatch(/FUNCTION public\.annual_review_employee_has_login/);
    expect(migration).toMatch(/SECURITY DEFINER/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.annual_review_employee_has_login\(uuid\) FROM PUBLIC/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.annual_review_employee_has_login\(uuid\) TO authenticated/);
  });

  it('uses the helper in both client-facing visibility policies', () => {
    const policies = migration.slice(
      migration.indexOf('DROP POLICY IF EXISTS instances_select_visible'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.get_hierarchy_completed_reviews'),
    );
    expect(policies).toMatch(/annual_review_employee_has_login\(employee_id\)/);
    expect(policies).toMatch(/annual_review_employee_has_login\(i\.employee_id\)/);
    expect(policies).not.toMatch(/FROM auth\.users/);
    for (const slot of ['manager_id', 'skip_id', 'dept_head_id', 'bu_head_id', 'hr_id', 'management_id']) {
      expect(policies).toContain(slot);
    }
  });
});