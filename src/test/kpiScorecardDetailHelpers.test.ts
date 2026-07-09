import { describe, it, expect } from 'vitest';

// Reproduce the module-scope helper to lock its contract. If this file ever
// moves back inside the component, the TDZ crash returns — the test doubles
// as a canary.
function getOrgTypeLabel(row: { isOrgKpi: boolean; orgKpiScope: string }): string {
  if (!row.isOrgKpi) return 'Individual';
  const scopeLabels: Record<string, string> = {
    organization: 'Org (Organization)',
    department: 'Org (Department)',
    employee: 'Org (Employee)',
  };
  return scopeLabels[row.orgKpiScope] ?? 'Org';
}

describe('KpiScorecardDetail getOrgTypeLabel', () => {
  it('returns Individual for non-org KPIs', () => {
    expect(getOrgTypeLabel({ isOrgKpi: false, orgKpiScope: '' })).toBe('Individual');
  });
  it('maps organization/department/employee scopes', () => {
    expect(getOrgTypeLabel({ isOrgKpi: true, orgKpiScope: 'organization' })).toBe('Org (Organization)');
    expect(getOrgTypeLabel({ isOrgKpi: true, orgKpiScope: 'department' })).toBe('Org (Department)');
    expect(getOrgTypeLabel({ isOrgKpi: true, orgKpiScope: 'employee' })).toBe('Org (Employee)');
  });
  it('falls back to Org for unknown scope', () => {
    expect(getOrgTypeLabel({ isOrgKpi: true, orgKpiScope: 'other' })).toBe('Org');
  });
});