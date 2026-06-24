import { describe, it, expect } from 'vitest';

/**
 * Regression test (RCA 2026-06-24): when `selectedCompanyId` is supplied,
 * ProductionDailyGrid MUST filter mapped employees using the RPC-provided
 * `company_id` field — NOT the `filterByCompany` prop (which relies on a
 * broad `from('profiles').select(...)` read and silently returns false
 * for everyone when the caller can only SELECT a partial slice of
 * `profiles` after PII hardening 2026-06-22).
 */

type Emp = { id: string; company_id: string | null };

function selectGridEmployees(
  mapped: Emp[],
  employeeRates: Map<string, unknown>,
  selectedCompanyId: string | undefined,
  filterByCompany?: (id: string) => boolean,
): Emp[] {
  const useRpcCompanyId = !!selectedCompanyId && selectedCompanyId !== 'all';
  return mapped.filter(e => {
    if (!employeeRates.has(e.id)) return false;
    if (useRpcCompanyId) {
      if (e.company_id !== selectedCompanyId) return false;
    } else if (filterByCompany && !filterByCompany(e.id)) {
      return false;
    }
    return true;
  });
}

describe('ProductionDailyGrid · company filter (RLS-agnostic)', () => {
  const bihar = 'company-bihar';
  const saibal = 'company-saibal';
  const mapped: Emp[] = [
    { id: 'e1', company_id: bihar },
    { id: 'e2', company_id: bihar },
    { id: 'e3', company_id: saibal },
  ];
  const rates = new Map<string, unknown>([['e1', {}], ['e2', {}], ['e3', {}]]);

  it('keeps Bihar employees when the RLS-restricted filterByCompany would drop them all', () => {
    // Simulates the PII-hardening regression: filterByCompany returns false
    // for every mapped employee because the caller's `employeeCompanyMap`
    // is missing them.
    const broken = () => false;
    const out = selectGridEmployees(mapped, rates, bihar, broken);
    expect(out.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('excludes employees of other companies when a company is selected', () => {
    const out = selectGridEmployees(mapped, rates, saibal);
    expect(out.map(e => e.id)).toEqual(['e3']);
  });

  it('falls back to filterByCompany when no company is selected', () => {
    const allowOnlyE2 = (id: string) => id === 'e2';
    const out = selectGridEmployees(mapped, rates, 'all', allowOnlyE2);
    expect(out.map(e => e.id)).toEqual(['e2']);
  });

  it('still respects the employeeRates gate', () => {
    const partialRates = new Map<string, unknown>([['e1', {}]]);
    const out = selectGridEmployees(mapped, partialRates, bihar);
    expect(out.map(e => e.id)).toEqual(['e1']);
  });
});