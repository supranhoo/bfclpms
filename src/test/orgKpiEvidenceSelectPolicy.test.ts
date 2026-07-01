import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-104 regression guard. Ensures a SELECT policy exists on the
 * `review-evidence` bucket that grants read access to files stored under
 * the shared `org-kpi-evidence/` prefix. Without it, ordinary employees
 * cannot preview or download Org-KPI supporting attachments.
 */
describe('ADR-104 Org-KPI evidence SELECT storage policy', () => {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
  const allSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
    .join('\n');

  it('migration defines "Org KPI evidence select" policy', () => {
    expect(allSql).toContain('Org KPI evidence select');
  });

  it('policy is scoped to review-evidence + org-kpi-evidence prefix for SELECT', () => {
    const idx = allSql.indexOf('"Org KPI evidence select"');
    expect(idx).toBeGreaterThan(-1);
    const window = allSql.slice(idx, idx + 600);
    expect(window).toMatch(/FOR\s+SELECT/i);
    expect(window).toMatch(/bucket_id\s*=\s*'review-evidence'/);
    expect(window).toMatch(/foldername\(name\)\)\[1\]\s*=\s*'org-kpi-evidence'/);
  });

  it('Org-KPI storage prefix has matching SELECT/INSERT/UPDATE/DELETE policies', () => {
    // POLICY invariant: every review-evidence prefix must have full CRUD coverage.
    expect(allSql).toContain('Org KPI evidence select');
    expect(allSql).toContain('Org KPI evidence insert');
    expect(allSql).toContain('Org KPI evidence update');
    expect(allSql).toContain('Org KPI evidence delete');
  });
});