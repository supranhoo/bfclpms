/**
 * ADR-341 follow-up — every bu-console module must evaluate cleanly.
 *
 * A missing named import (e.g. `targetForType` in GroupDefinitionEditDialog)
 * passed build + typecheck but crashed the Performance Console at render time.
 * Importing each module here turns that class of failure into a test failure.
 */
import { describe, it, expect } from 'vitest';

const modules = import.meta.glob('../components/admin/bu-console/*.{ts,tsx}');

describe('bu-console module bindings', () => {
  it('every module loads without an unresolved binding', async () => {
    const paths = Object.keys(modules).filter((p) => !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'));
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) {
      await expect(modules[p]()).resolves.toBeTruthy();
    }
  });
});
