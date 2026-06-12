/**
 * Safety Perf CAPA Wave 3 — static-source guard tests.
 *
 * Locks the Wave 3 invariants:
 *  - Training mutations never invalidate the bare `['safety','training']`
 *    sub-root (which re-fires every SOP list, quiz, questions, and
 *    assignment query — including those for unrelated SOPs).
 *  - `useSopAssignments` is capped at <= 500 rows server-side via `.range()`.
 *  - SafetyPermits page uses canonical primitives (already complete pre-Wave 3,
 *    locked here to prevent regression).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Safety Perf CAPA Wave 3 — scoped training invalidation + caps', () => {
  it('useSafetyTraining mutations never invalidate the bare [safety, training] root', () => {
    const src = read('src/hooks/useSafetyTraining.ts');
    // Allow the read hook query keys (those are fine — they're the keys, not invalidations).
    expect(src).not.toMatch(/invalidateQueries\(\s*\{\s*queryKey:\s*\[\s*['"]safety['"]\s*,\s*['"]training['"]\s*\]\s*\}\s*\)/);
  });

  it('useSopAssignments is capped at <= 500 rows server-side', () => {
    const src = read('src/hooks/useSafetyTraining.ts');
    expect(src).toMatch(/\.range\(\s*0\s*,\s*499\s*\)/);
    // The old 2000-row .limit() must not return.
    expect(src).not.toMatch(/\.limit\(\s*2000\s*\)/);
  });

  it('SafetyPermits page uses canonical primitives (no regression)', () => {
    const src = read('src/pages/safety/SafetyPermits.tsx');
    expect(src).toMatch(/useManualQuery/);
    expect(src).toMatch(/SafetyFilterSheet/);
    expect(src).toMatch(/SafetyResponsiveList/);
    // Scoped realtime — should subscribe only to the two permit-related tables.
    expect(src).toMatch(/safety_permits.*safety_permit_approvals/s);
  });
});
