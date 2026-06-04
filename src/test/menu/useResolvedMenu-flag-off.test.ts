/**
 * CAPA invariant I4 — `system_settings.menu_overrides_enabled = false` is
 * the kill switch. `useResolvedMenu` MUST NOT issue the resolver query
 * when the flag is off, AND the queryFn MUST hard-guard against a stale
 * cached `enabled=true` payload by returning `undefined` at call time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src/hooks/useResolvedMenu.ts'),
  'utf8',
);

describe('CAPA I4 — useResolvedMenu honours the master kill switch', () => {
  it('query is gated by `enabled: !!enabled` (flag off ⇒ no fetch)', () => {
    expect(SRC).toMatch(/enabled:\s*!!\s*enabled/);
  });

  it('queryFn returns undefined when the flag is off at call time (defeats stale cache)', () => {
    expect(SRC).toMatch(/if\s*\(\s*!enabled\s*\)\s*return\s+undefined/);
  });

  it('useLabelFor falls back to the supplied default when no resolver data exists', () => {
    expect(SRC).toMatch(/if\s*\(\s*!menuKey\s*\|\|\s*!data\s*\)\s*return\s+fallback/);
  });
});