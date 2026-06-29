import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-096 regression guard. Ensures the three on-behalf write policies on
 * the `review-evidence` storage bucket remain in the migrations folder so a
 * future drop / rename surfaces immediately.
 */
describe('ADR-096 review-evidence on-behalf storage policies', () => {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const allSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
    .join('\n');

  const required = [
    'Admins and HR PMS can upload evidence on behalf',
    'Admins and HR PMS can update evidence on behalf',
    'Admins and HR PMS can delete evidence on behalf',
  ];

  for (const name of required) {
    it(`migration defines policy: ${name}`, () => {
      expect(allSql).toContain(name);
    });
  }

  it('each on-behalf policy is scoped to review-evidence and admin OR hr_pms', () => {
    for (const name of required) {
      const idx = allSql.indexOf(name);
      expect(idx).toBeGreaterThan(-1);
      // Inspect a generous window after the CREATE POLICY line.
      const window = allSql.slice(idx, idx + 800);
      expect(window).toMatch(/bucket_id\s*=\s*'review-evidence'/);
      expect(window).toMatch(/has_role\(\s*auth\.uid\(\)\s*,\s*'admin'/);
      expect(window).toMatch(/has_role\(\s*auth\.uid\(\)\s*,\s*'hr_pms'/);
    }
  });
});
