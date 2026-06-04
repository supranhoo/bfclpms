/**
 * Phase 8 SSOT — Module Hub kill-switch contract.
 *
 * Read-only. No DB writes. Asserts source-code invariants that, when broken,
 * would let the Safety Hub card leak past `useModules`'s gating.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/hooks/useModules.ts', 'utf8');

describe('Phase 8 — Safety module gate (useModules)', () => {
  it('reads from public.modules with is_enabled = true', () => {
    expect(SRC).toMatch(/\.from\(\s*['"]modules['"]\s*\)/);
    expect(SRC).toMatch(/\.eq\(\s*['"]is_enabled['"]\s*,\s*true\s*\)/);
  });

  it('subscribes to safety_module_access realtime so revokes hide the Hub card within one tick', () => {
    expect(SRC).toMatch(/table:\s*['"]safety_module_access['"]/);
    expect(SRC).toMatch(/invalidateQueries\(\s*\{\s*queryKey:\s*\[['"]modules['"]\]/);
  });

  it('asks the DB via has_safety_module_access RPC (no client-side bypass)', () => {
    expect(SRC).toMatch(/has_safety_module_access/);
  });
});
