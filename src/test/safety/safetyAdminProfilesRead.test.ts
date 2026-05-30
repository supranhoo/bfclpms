/**
 * Phase 19.1 — Migration lock for the Safety-admin profiles read policy.
 *
 * Without this policy a Safety admin who is NOT also a PMS admin sees an
 * empty user list on /safety/settings/users — the actual cause of the
 * "user search not working" report. The policy is intentionally narrow:
 * SELECT-only, active profiles only, gated by has_safety_role(_, 'admin').
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function latestMigrationWithPolicy(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (
      /CREATE\s+POLICY\s+"Safety admins can view active profiles for role grants"/i.test(
        body,
      )
    ) {
      return body;
    }
  }
  throw new Error('Safety-admin profiles read policy migration was not found');
}

describe('Safety admin profiles read policy (Phase 19.1)', () => {
  const sql = latestMigrationWithPolicy();

  it('is SELECT-only on public.profiles', () => {
    expect(sql).toMatch(
      /CREATE\s+POLICY[\s\S]*"Safety admins can view active profiles for role grants"[\s\S]*ON\s+public\.profiles[\s\S]*FOR\s+SELECT/i,
    );
  });

  it('is scoped to active profiles', () => {
    expect(sql).toMatch(/is_active\s*=\s*true/i);
  });

  it('is gated by has_safety_role(_, admin)', () => {
    expect(sql).toMatch(/has_safety_role\(\s*auth\.uid\(\)\s*,\s*'admin'/i);
  });

  it('targets only authenticated users', () => {
    expect(sql).toMatch(/TO\s+authenticated/i);
  });
});