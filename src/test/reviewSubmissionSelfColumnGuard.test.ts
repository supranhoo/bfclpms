import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

function latestSelfColumnGuard(): string {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .map((file) => readFileSync(resolve(migrationsDir, file), 'utf8'))
    .find((sql) => sql.includes('CREATE OR REPLACE FUNCTION public.tg_review_submissions_self_column_guard')) ?? '';
}

describe('review_submissions employee self-column guard', () => {
  const migration = latestSelfColumnGuard();

  it.each([
    'manager_score',
    'auditor_score',
    'management_score',
    'final_score',
    'final_rating',
  ])('blocks employee changes to %s', (column) => {
    expect(migration).toMatch(new RegExp(`NEW\\.${column}\\s+IS DISTINCT FROM OLD\\.${column}`));
  });

  it('raises instead of silently accepting reviewer-field tampering', () => {
    expect(migration).toContain('Employees cannot modify reviewer or workflow fields');
  });

  it('limits the bypass to a transaction-local setting used by vetted writers', () => {
    expect(migration).toContain("current_setting('app.self_submit_bypass', true)");
    expect(migration).toContain("set_config('app.self_submit_bypass','on',true)");
  });
});