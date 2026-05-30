/**
 * Phase 16 — Regression lock for safety_incidents INSERT RLS.
 *
 * Locks the migration that opened incident reporting to all authenticated
 * users (EHS standard). Any future migration that re-narrows the policy
 * MUST also update this test and the corresponding POLICY.md section.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function latestMigrationDefiningInsertPolicy(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (/CREATE\s+POLICY[^;]*ON\s+public\.safety_incidents[\s\S]*?FOR\s+INSERT/i.test(body)) {
      return body;
    }
  }
  throw new Error('No migration defining an INSERT policy on safety_incidents was found');
}

describe('safety_incidents INSERT policy (Phase 16)', () => {
  const sql = latestMigrationDefiningInsertPolicy();

  it('drops the legacy module-access-gated INSERT policy', () => {
    expect(sql).toMatch(
      /DROP\s+POLICY[^;]*"Safety users can report incidents"[^;]*ON\s+public\.safety_incidents/i,
    );
  });

  it('creates the new authenticated-scoped INSERT policy', () => {
    expect(sql).toMatch(
      /CREATE\s+POLICY[\s\S]*"Authenticated users can report incidents"[\s\S]*FOR\s+INSERT[\s\S]*TO\s+authenticated/i,
    );
  });

  it('still pins reporter_id to auth.uid() to prevent impersonation', () => {
    expect(sql).toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/reporter_id\s*=\s*auth\.uid\(\)/i);
  });

  it('does NOT re-introduce has_safety_module_access on the INSERT branch', () => {
    const match = sql.match(
      /CREATE\s+POLICY[\s\S]*"Authenticated users can report incidents"[\s\S]*?;/i,
    );
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/has_safety_module_access/i);
  });
});
