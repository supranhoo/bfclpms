/**
 * Migration lock for the Safety responsible-roles profiles read policy.
 *
 * Without this policy, a BU Head / Safety Head / other responsible safety
 * role who is NOT a Safety admin sees an EMPTY "Select investigator" /
 * "Select verifier" dropdown on the incident detail page and "—" names in
 * the routing chain (the "unable to assign, no user visible" report).
 *
 * The policy is intentionally narrow: SELECT-only, active profiles only,
 * gated by has_responsible_safety_role() which excludes plain workers so
 * the employee directory is not exposed org-wide.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const POLICY = 'Safety responsible roles can view active profiles';

function latestMigrationWithPolicy(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (new RegExp(`CREATE\\s+POLICY\\s+"${POLICY}"`, 'i').test(body)) {
      return body;
    }
  }
  throw new Error('Safety responsible-roles profiles read policy migration was not found');
}

function latestMigrationWithHelper(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (/FUNCTION\s+public\.has_responsible_safety_role/i.test(body)) {
      return body;
    }
  }
  throw new Error('has_responsible_safety_role migration was not found');
}

describe('Safety responsible roles profiles read policy', () => {
  const sql = latestMigrationWithPolicy();

  it('is SELECT-only on public.profiles', () => {
    expect(sql).toMatch(
      new RegExp(
        `CREATE\\s+POLICY[\\s\\S]*"${POLICY}"[\\s\\S]*ON\\s+public\\.profiles[\\s\\S]*FOR\\s+SELECT`,
        'i',
      ),
    );
  });

  it('is scoped to active profiles', () => {
    expect(sql).toMatch(/is_active\s*=\s*true/i);
  });

  it('is gated by has_responsible_safety_role', () => {
    expect(sql).toMatch(/has_responsible_safety_role\(\s*auth\.uid\(\)\s*\)/i);
  });

  it('targets only authenticated users', () => {
    expect(sql).toMatch(/TO\s+authenticated/i);
  });
});

describe('has_responsible_safety_role helper (latest definition)', () => {
  const sql = latestMigrationWithHelper();

  it('excludes plain workers from both role sources', () => {
    expect(sql).toMatch(/role\s*<>\s*'worker'/i);
    expect(sql).toMatch(/r\.code\s*<>\s*'safety_worker'/i);
  });

  it('includes users named in ACTIVE routing rules', () => {
    expect(sql).toMatch(/safety_incident_routing_rules/i);
    expect(sql).toMatch(/rr\.is_active\s*=\s*true/i);
    expect(sql).toMatch(/rr\.bu_head_id\s*=\s*_user_id/i);
    expect(sql).toMatch(/rr\.second_manager_id\s*=\s*_user_id/i);
  });

  it('includes users on any incident routing/assignment chain', () => {
    expect(sql).toMatch(/i\.assigned_to\s*=\s*_user_id/i);
    expect(sql).toMatch(/i\.routed_bu_head_id\s*=\s*_user_id/i);
    expect(sql).toMatch(/i\.verifier_id\s*=\s*_user_id/i);
  });
});