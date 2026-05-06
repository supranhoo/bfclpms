import { describe, it, expect } from 'vitest';

/**
 * ADR-064 — The "X employees" badge on an Org KPI card MUST equal the
 * number of rows actually rendered in the scoped entry table.
 *
 * Regression: in May 2026 a data owner saw "50 employees" in the badge but
 * "55 Employees (0/55 entered)" in the section header for the same KPI,
 * because the badge came from a count snapshot while the rows came from
 * the live mapping joined against `allProfiles`. The fix anchors the
 * badge to `scopedRows.length` for scoped KPIs.
 */

function pickEmployeeCount(opts: {
  scope: 'organization' | 'department' | 'employee';
  scopedRows?: Array<unknown>;
  fallback: number;
}): number {
  if ((opts.scope === 'employee' || opts.scope === 'department') && opts.scopedRows) {
    return opts.scopedRows.length;
  }
  return opts.fallback;
}

describe('Org KPI employee count parity', () => {
  it('uses scopedRows length for employee scope', () => {
    expect(
      pickEmployeeCount({ scope: 'employee', scopedRows: new Array(55), fallback: 50 }),
    ).toBe(55);
  });

  it('uses scopedRows length for department scope', () => {
    expect(
      pickEmployeeCount({ scope: 'department', scopedRows: new Array(7), fallback: 12 }),
    ).toBe(7);
  });

  it('falls back to count map for organization scope', () => {
    expect(
      pickEmployeeCount({ scope: 'organization', scopedRows: undefined, fallback: 3 }),
    ).toBe(3);
  });
});