/**
 * Safety Perf CAPA Wave 1 — static-source guard tests (v2.66.19).
 *
 * Locks the invariants in `mem://infrastructure/safety-perf-capa-wave-1`:
 *  - SafetySlaQueueCard must use the scoped `useSafetySlaQueue` hook,
 *    not the deprecated `useSafetyIncidents()` list overload.
 *  - KpiDrillDownDialog must use `useSafetyIncidentsByDrillKey`, not
 *    `useSafetyIncidents()`.
 *  - `useSafetyIncidents()` must remain `enabled: false` so it cannot
 *    auto-fetch on mount if accidentally re-imported.
 *  - `useSafetyAssets(filters)` legacy list hook must not be re-added.
 *  - SafetyIncidents.tsx `fetchIncidentsPage` must gate the profiles
 *    join on `filters.typeName` (case-insensitive accident match).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
function read(p: string): string {
  return readFileSync(join(root, p), 'utf8');
}

describe('Safety Perf CAPA Wave 1 — scoped incident reads', () => {
  it('SafetySlaQueueCard imports useSafetySlaQueue, not useSafetyIncidents', () => {
    const src = read('src/components/safety/SafetySlaQueueCard.tsx');
    expect(src).toMatch(/useSafetySlaQueue/);
    expect(src).not.toMatch(/from\s+'@\/hooks\/useSafetyIncidents'[^;]*useSafetyIncidents\b(?!ByDrillKey|\w)/);
  });

  it('KpiDrillDownDialog imports useSafetyIncidentsByDrillKey, not useSafetyIncidents()', () => {
    const src = read('src/components/safety/analytics/KpiDrillDownDialog.tsx');
    expect(src).toMatch(/useSafetyIncidentsByDrillKey/);
    // The bare `useSafetyIncidents(` call site must be gone.
    expect(src).not.toMatch(/\buseSafetyIncidents\s*\(/);
  });

  it('useSafetyIncidents() shim is gated with enabled: false', () => {
    const src = read('src/hooks/useSafetyIncidents.ts');
    // Locate the deprecated unparameterised list hook and assert it sets enabled:false.
    const block = src.split('export function useSafetyIncidents(')[1] ?? '';
    const fnBody = block.split('export function')[0] ?? '';
    expect(fnBody).toMatch(/enabled:\s*false/);
  });

  it('scoped hooks exist with server-side predicates', () => {
    const src = read('src/hooks/useSafetyIncidents.ts');
    // useSafetySlaQueue: open + red/amber + ordered by sla_due_at + capped.
    expect(src).toMatch(/useSafetySlaQueue/);
    expect(src).toMatch(/\.in\(['"]sla_state['"]\s*,\s*\[['"]red['"]\s*,\s*['"]amber['"]\]\)/);
    expect(src).toMatch(/\.range\(0,\s*99\)/);
    // Per-kind drill predicates.
    expect(src).toMatch(/useSafetyIncidentsByDrillKey/);
    expect(src).toMatch(/severity['"]\s*,\s*['"]critical['"]/);
  });

  it('SafetyIncidents fetchIncidentsPage gates profiles join on accident type', () => {
    const src = read('src/pages/safety/SafetyIncidents.tsx');
    // typeName must flow on the filter object.
    expect(src).toMatch(/typeName:\s*string\s*\|\s*null/);
    // Hydration must be conditional on /accident/i.
    expect(src).toMatch(/needsPersonHydration[\s\S]{0,200}accident/i);
  });

  it('useSafetyAssets legacy list hook is deleted', () => {
    const src = read('src/hooks/useSafetyAssets.ts');
    expect(src).not.toMatch(/export function useSafetyAssets\s*\(/);
    expect(src).not.toMatch(/\.limit\(1000\)/);
  });
});