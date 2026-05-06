import { describe, it, expect } from 'vitest';

/**
 * ADR-064 (revised) — the "X employees" badge MUST be the canonical mapped
 * count from `mappedEmpIdsByKey` / `employeeCountMap`. The expanded scoped
 * table separately reports how many rows the current user can see; if
 * mapped > visible, the existing amber visibility-mismatch banner explains
 * the gap (ADR-060). The two derivations are NOT the same metric.
 */

function pickEmployeeCount(opts: {
  scope: 'organization' | 'department' | 'employee';
  scopedRows?: Array<unknown>;
  mappedCount: number;
}): number {
  return opts.mappedCount;
}

describe('Org KPI employee count parity', () => {
  it('uses canonical mapped count for employee scope, even when RLS hides rows', () => {
    expect(
      pickEmployeeCount({ scope: 'employee', scopedRows: new Array(50), mappedCount: 55 }),
    ).toBe(55);
  });

  it('uses canonical mapped count for department scope', () => {
    expect(
      pickEmployeeCount({ scope: 'department', scopedRows: new Array(7), mappedCount: 12 }),
    ).toBe(12);
  });

  it('uses count map for organization scope', () => {
    expect(
      pickEmployeeCount({ scope: 'organization', scopedRows: undefined, mappedCount: 3 }),
    ).toBe(3);
  });
});