import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * RCA 2026-05-19 (v2) — Regression guard.
 *
 * Yesterday's first fix called `useEnsureOrgKpiScopeRows` from an on-mount
 * useEffect inside `OrgKpiEntryCard`. On a page with ~183 KPI cards this
 * produced 183 concurrent RPC calls + ~900 cache invalidations, making
 * Org KPI Data Entry unreliable to load. The materialisation MUST stay on
 * the user's click path (open Manage Files / chip click), never on mount.
 */
describe('OrgKpiEntryCard ensureScopeRows must be lazy (click-driven)', () => {
  const src = readFileSync('src/components/admin/OrgKpiEntryCard.tsx', 'utf8');

  it('does not call ensureScopeRows.mutate from any useEffect', () => {
    // No useEffect body in this file should reference ensureScopeRows.
    const effects = src.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\}\s*,\s*\[[\s\S]*?\]\s*\)/g) ?? [];
    for (const body of effects) {
      expect(body, 'A useEffect references ensureScopeRows — must be lazy on user click only').not.toMatch(/ensureScopeRows/);
    }
  });

  it('exposes a click-time openEvidenceSheet that awaits ensureScopeRows.mutateAsync', () => {
    expect(src).toMatch(/openEvidenceSheet\s*=\s*useCallback/);
    expect(src).toMatch(/ensureScopeRows\.mutateAsync\(/);
  });

  it('wires openEvidenceSheet to the Status chip, Parity badge and Manage files button', () => {
    // All three header entry points must use the gated opener.
    const occurrences = (src.match(/onClick=\{openEvidenceSheet\}/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});
