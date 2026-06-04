/**
 * Phase 8 SSOT — Module Hub realtime kill-switch latency regression.
 *
 * Guards the contract that revoking Safety access on any of three tables
 * invalidates the `modules` query immediately. If a future refactor removes
 * any of these subscriptions, the Hub card would stay visible until the next
 * page load — this test fails fast in that case.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/hooks/useModules.ts', 'utf8');

const REQUIRED_TABLES = [
  'safety_module_access',
  'iac_user_role_assignments',
  'safety_user_roles',
];

describe('Phase 8 — Module Hub realtime kill-switch', () => {
  for (const t of REQUIRED_TABLES) {
    it(`subscribes to postgres_changes on ${t}`, () => {
      const re = new RegExp(`table:\\s*['"]${t}['"]`);
      expect(SRC).toMatch(re);
    });
  }

  it('every postgres_changes handler invalidates the modules query', () => {
    const invalidations = SRC.match(/invalidateQueries\(\s*\{\s*queryKey:\s*\[['"]modules['"]\]/g) ?? [];
    expect(invalidations.length).toBeGreaterThanOrEqual(REQUIRED_TABLES.length);
  });

  it('filters subscriptions by the current user id (no cross-user noise)', () => {
    expect(SRC).toMatch(/filter:\s*`user_id=eq\.\$\{user\.id\}`/);
  });
});
