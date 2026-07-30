import { describe, expect, it } from 'vitest';

/**
 * ADR-202 — the importer pre-flight must mirror the create-employee
 * company-scope rule for employee categories.
 * Mock master data: every category belongs to BFCL; two other companies exist.
 */
const BFCL = 'company-bfcl';
const SAIBAL = 'company-saibal';
const ARUNA = 'company-aruna';

const CATEGORIES = [
  { name: 'ESI', company_id: BFCL },
  { name: 'Non ESI', company_id: BFCL },
  { name: 'Non ESI', company_id: SAIBAL },
  { name: 'Retainership', company_id: ARUNA },
  { name: 'Trainee', company_id: BFCL },
  { name: 'Consultant', company_id: null }, // global category
];

const COMPANIES = [
  { id: BFCL, code: 'BFCL', name: 'Bihar Foundry & Casting Limited' },
  { id: SAIBAL, code: 'Saibal', name: 'Saibal Kunar' },
  { id: ARUNA, code: 'AI', name: 'Aruna Industries' },
];

function resolveCompanyId(code?: string): string | null {
  if (!code) return null;
  return COMPANIES.find(
    (c) => c.code.toLowerCase() === code.toLowerCase() || c.name.toLowerCase() === code.toLowerCase(),
  )?.id ?? null;
}

function categoryAllowedForCompany(categoryName: string, companyId: string | null): boolean {
  if (!companyId) return true;
  return CATEGORIES.some(
    (c) =>
      c.name.trim().toLowerCase() === categoryName.trim().toLowerCase() &&
      (!c.company_id || c.company_id === companyId),
  );
}

describe('employee category company scoping', () => {
  it('accepts a company-owned category for its own company', () => {
    expect(categoryAllowedForCompany('ESI', resolveCompanyId('BFCL'))).toBe(true);
  });

  it('rejects a BFCL-only category for another company', () => {
    expect(categoryAllowedForCompany('ESI', resolveCompanyId('Saibal'))).toBe(false);
  });

  it('accepts a category when the second company has its own master row', () => {
    expect(categoryAllowedForCompany('Non ESI', resolveCompanyId('Saibal'))).toBe(true);
  });

  it('accepts the repaired Retainership category for Aruna Industries', () => {
    expect(categoryAllowedForCompany('Retainership', resolveCompanyId('AI'))).toBe(true);
  });

  it('still rejects a category missing for the selected company', () => {
    expect(categoryAllowedForCompany('Retainership', resolveCompanyId('Saibal'))).toBe(false);
  });

  it('accepts a global (company_id NULL) category for any company', () => {
    expect(categoryAllowedForCompany('Consultant', resolveCompanyId('Saibal'))).toBe(true);
  });

  it('skips the scope check when the row has no company', () => {
    expect(categoryAllowedForCompany('ESI', resolveCompanyId(undefined))).toBe(true);
  });

  it('matches company by full name as well as code', () => {
    expect(resolveCompanyId('Bihar Foundry & Casting Limited')).toBe(BFCL);
    expect(resolveCompanyId('Aruna Industries')).toBe(ARUNA);
  });

  it('treats an unknown company code as unscoped rather than failing hard', () => {
    expect(categoryAllowedForCompany('ESI', resolveCompanyId('NOPE'))).toBe(true);
  });
});
