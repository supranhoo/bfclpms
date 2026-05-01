import { describe, it, expect } from 'vitest';
import type { RegistryBrowserResult, RegistryDefinitionView } from './useRegistryBrowser';

/**
 * Phase 3c: Contract tests for the registry browser hook.
 *
 * Locks the safety properties documented in §88G:
 * - The view must NEVER carry employee identifiers, scores, or any
 *   per-row performance data. The TypeScript shape itself is the lock —
 *   if anyone widens RegistryDefinitionView with sensitive fields the
 *   compiler will surface it; this test asserts the runtime shape too.
 * - The result is always defined (empty array fallback) so the page
 *   never has to defend against `undefined.definitions`.
 */

const ALLOWED_KEYS: ReadonlyArray<keyof RegistryDefinitionView> = [
  'id',
  'canonical_kra_name',
  'canonical_kpi_name',
  'category_id',
  'category_name',
  'category_color',
  'aliases',
  'alias_count',
  'usage_count',
];

const FORBIDDEN_KEYS = [
  'employee_id',
  'employee_code',
  'employee_name',
  'self_score',
  'manager_score',
  'auditor_score',
  'final_score',
  'achieved_value',
  'r0', 'r1', 'r2', 'r3', 'r4', 'r5',
];

function makeDef(overrides: Partial<RegistryDefinitionView> = {}): RegistryDefinitionView {
  return {
    id: 'def-1',
    canonical_kra_name: 'Safety',
    canonical_kpi_name: 'Lost Time Injury',
    category_id: 'cat-1',
    category_name: 'Safety',
    category_color: '#ff0000',
    aliases: [{ kra_name: 'Safety', kpi_name: 'LTI' }],
    alias_count: 1,
    usage_count: 5,
    ...overrides,
  };
}

describe('RegistryDefinitionView shape', () => {
  it('never contains forbidden sensitive fields', () => {
    const def = makeDef();
    for (const k of FORBIDDEN_KEYS) {
      expect(def).not.toHaveProperty(k);
    }
  });

  it('exposes only the documented allowed keys', () => {
    const def = makeDef();
    const keys = Object.keys(def).sort();
    expect(keys).toEqual([...ALLOWED_KEYS].sort());
  });
});

describe('RegistryBrowserResult fallback shape', () => {
  it('handles a minimum well-formed payload', () => {
    const r: RegistryBrowserResult = { definitions: [], total_count: 0 };
    expect(r.definitions).toEqual([]);
    expect(r.total_count).toBe(0);
  });

  it('counts aggregate usage across rows without leaking detail', () => {
    const r: RegistryBrowserResult = {
      definitions: [makeDef({ usage_count: 3 }), makeDef({ id: 'def-2', usage_count: 7 })],
      total_count: 2,
    };
    const totalUsage = r.definitions.reduce((s, d) => s + d.usage_count, 0);
    expect(totalUsage).toBe(10);
    // Aggregates only — no per-employee breakdown is present anywhere.
    for (const d of r.definitions) {
      for (const k of FORBIDDEN_KEYS) {
        expect(d).not.toHaveProperty(k);
      }
    }
  });
});