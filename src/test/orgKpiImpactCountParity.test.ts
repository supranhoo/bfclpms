import { describe, it, expect } from 'vitest';

/**
 * ADR-064 addendum — the Impact Analysis sheet's "Total Affected" must equal
 * the count shown on the Org KPI card badge. The sheet receives the
 * canonical employee id list from the card and uses it to anchor display.
 */
function pickDisplayedTotal(opts: {
  expectedEmployeeIds?: string[];
  impactTotal: number;
}) {
  return opts.expectedEmployeeIds?.length ?? opts.impactTotal;
}

function pickHidden(opts: {
  expectedEmployeeIds?: string[];
  rendered: number;
}) {
  if (!opts.expectedEmployeeIds) return 0;
  return Math.max(0, opts.expectedEmployeeIds.length - opts.rendered);
}

describe('Org KPI Impact sheet count parity', () => {
  it('uses expectedEmployeeIds length when provided', () => {
    expect(pickDisplayedTotal({ expectedEmployeeIds: new Array(55), impactTotal: 50 })).toBe(55);
  });

  it('falls back to impact total when expected list is missing', () => {
    expect(pickDisplayedTotal({ expectedEmployeeIds: undefined, impactTotal: 12 })).toBe(12);
  });

  it('reports the count hidden by access policy', () => {
    expect(pickHidden({ expectedEmployeeIds: new Array(55), rendered: 50 })).toBe(5);
  });

  it('hidden count is zero when sheet matches the badge', () => {
    expect(pickHidden({ expectedEmployeeIds: new Array(55), rendered: 55 })).toBe(0);
  });
});
