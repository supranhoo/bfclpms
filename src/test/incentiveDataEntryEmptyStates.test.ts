import { describe, it, expect } from 'vitest';

/**
 * Pure-logic mirror of ProductionDailyGrid's diagnostic empty-state.
 * Locks in the four messages so operators can self-diagnose missing data.
 * RCA 2026-06-17.
 */

type Args = {
  mappedCount: number;
  ratesCount: number;
  resolvedCount: number;
  companyName?: string;
  month: string;
  year: number;
};

function emptyStateMessage(a: Args): string {
  if (a.mappedCount === 0) {
    return 'This program has no employee mappings. Open Program Mapping (Incentive Config) to add employees.';
  }
  if (a.ratesCount === 0) {
    return 'No production rates configured. Open the program\'s "Production Rates" tab to add a rate.';
  }
  if (a.resolvedCount === 0) {
    return `Rates exist, but none of the ${a.mappedCount} mapped employees resolve to a rate for ${a.month} ${a.year}. Check effective dates and employee/department/BU/company coverage.`;
  }
  if (a.companyName) {
    return `No mapped employees match the selected company filter "${a.companyName}". Clear the company filter or pick another company.`;
  }
  return 'No employees to display with the current filters.';
}

describe('ProductionDailyGrid empty-state', () => {
  const base = { month: 'June', year: 2026 };

  it('no mappings → prompts to open Program Mapping', () => {
    expect(emptyStateMessage({ ...base, mappedCount: 0, ratesCount: 0, resolvedCount: 0 }))
      .toMatch(/no employee mappings/i);
  });

  it('mappings but no rates → prompts to add a rate', () => {
    expect(emptyStateMessage({ ...base, mappedCount: 287, ratesCount: 0, resolvedCount: 0 }))
      .toMatch(/No production rates configured/);
  });

  it('rates exist but no employee resolves → diagnostic includes mapping count + month/year', () => {
    const msg = emptyStateMessage({ ...base, mappedCount: 287, ratesCount: 3, resolvedCount: 0 });
    expect(msg).toMatch(/287 mapped employees/);
    expect(msg).toMatch(/June 2026/);
  });

  it('company filter excludes everyone → names the company', () => {
    const msg = emptyStateMessage({
      ...base, mappedCount: 287, ratesCount: 3, resolvedCount: 287, companyName: 'Saibal Kunar',
    });
    expect(msg).toMatch(/"Saibal Kunar"/);
  });

  it('no company selected + no rows → generic fallback', () => {
    const msg = emptyStateMessage({ ...base, mappedCount: 287, ratesCount: 3, resolvedCount: 287 });
    expect(msg).toMatch(/No employees to display/);
  });
});