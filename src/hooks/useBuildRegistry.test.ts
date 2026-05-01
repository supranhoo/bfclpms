import { describe, it, expect } from 'vitest';
import { diffAliasInserts } from './useKpiRegistry';

const CAT = 'cat-1';
const canonical = { kra_name: 'Timely Grievance Resolution', kpi_name: 'Timely Resolution of Employee Grievances' };

describe('diffAliasInserts', () => {
  it('returns canonical + all variants when no aliases exist yet', () => {
    const variants = [
      { kra_name: 'Grievance Mgmt', kpi_name: 'Timely Resolution of Employee Grievances' },
      { kra_name: 'People Mgmt', kpi_name: 'Timely Resolution of Employee Grievances' },
    ];
    const { rows, totalConsidered } = diffAliasInserts(canonical, variants, CAT, []);
    expect(totalConsidered).toBe(3);
    expect(rows).toHaveLength(3);
    expect(rows.every(r => r.category_id === CAT)).toBe(true);
  });

  it('skips aliases already linked (case + whitespace insensitive)', () => {
    const variants = [
      { kra_name: 'Grievance Mgmt', kpi_name: 'Timely Resolution of Employee Grievances' },
    ];
    const existing = [
      // canonical already linked, with messy casing/whitespace
      { variant_kra_name: '  timely grievance resolution ', variant_kpi_name: 'TIMELY RESOLUTION OF EMPLOYEE GRIEVANCES', category_id: CAT },
    ];
    const { rows, totalConsidered } = diffAliasInserts(canonical, variants, CAT, existing);
    expect(totalConsidered).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].variant_kra_name).toBe('Grievance Mgmt');
  });

  it('returns empty rows when all variants already linked', () => {
    const variants = [
      { kra_name: 'Grievance Mgmt', kpi_name: 'Timely Resolution of Employee Grievances' },
    ];
    const existing = [
      { variant_kra_name: 'Timely Grievance Resolution', variant_kpi_name: 'Timely Resolution of Employee Grievances', category_id: CAT },
      { variant_kra_name: 'Grievance Mgmt', variant_kpi_name: 'Timely Resolution of Employee Grievances', category_id: CAT },
    ];
    const { rows } = diffAliasInserts(canonical, variants, CAT, existing);
    expect(rows).toHaveLength(0);
  });

  it('de-duplicates internal duplicates in the variant list', () => {
    const variants = [
      { kra_name: 'Grievance Mgmt', kpi_name: 'Timely Resolution of Employee Grievances' },
      { kra_name: 'grievance mgmt', kpi_name: 'TIMELY RESOLUTION OF EMPLOYEE GRIEVANCES' },
      { kra_name: 'Grievance Mgmt', kpi_name: 'Timely Resolution of Employee Grievances' },
    ];
    const { rows, totalConsidered } = diffAliasInserts(canonical, variants, CAT, []);
    expect(totalConsidered).toBe(2); // canonical + one unique variant
    expect(rows).toHaveLength(2);
  });

  it('treats different category_id as a distinct alias', () => {
    const variants = [
      { kra_name: 'Grievance Mgmt', kpi_name: 'Timely Resolution of Employee Grievances' },
    ];
    const existing = [
      // same name pair but different category
      { variant_kra_name: 'Grievance Mgmt', variant_kpi_name: 'Timely Resolution of Employee Grievances', category_id: 'other-cat' },
    ];
    const { rows } = diffAliasInserts(canonical, variants, CAT, existing);
    expect(rows).toHaveLength(2); // canonical + variant — neither matches existing under CAT
  });
});