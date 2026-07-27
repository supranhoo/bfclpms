import { describe, it, expect } from 'vitest';
import { buildMappableReports, getDefaultReportAccess } from './accessCatalog';

const registry = [
  { report_key: 'kpi-status-tracker', display_name: 'KPI Status Tracker', is_active: true },
  { report_key: 'performance', display_name: 'Performance Report', is_active: true },
  { report_key: 'retired', display_name: 'Retired Report', is_active: false },
];

describe('buildMappableReports', () => {
  it('lists registry reports that have no access config row as unmapped', () => {
    const rows = buildMappableReports(registry, []);
    const kst = rows.find(r => r.report_key === 'kpi-status-tracker');
    expect(kst).toBeDefined();
    expect(kst!.isConfigured).toBe(false);
    expect(kst!.view_roles).toEqual(['admin']);
  });

  it('prefers saved config values and marks them configured', () => {
    const rows = buildMappableReports(registry, [
      { report_key: 'kpi-status-tracker', report_name: 'KST', view_roles: ['admin', 'hr_pms'], download_roles: ['admin'] },
    ]);
    const kst = rows.find(r => r.report_key === 'kpi-status-tracker')!;
    expect(kst.isConfigured).toBe(true);
    expect(kst.view_roles).toEqual(['admin', 'hr_pms']);
    expect(kst.report_name).toBe('KPI Status Tracker');
  });

  it('excludes inactive registry reports and de-duplicates keys', () => {
    const rows = buildMappableReports(registry, [
      { report_key: 'performance', report_name: 'Performance Report', view_roles: ['admin'], download_roles: ['admin'] },
    ]);
    expect(rows.some(r => r.report_key === 'retired')).toBe(false);
    expect(rows.filter(r => r.report_key === 'performance')).toHaveLength(1);
  });

  it('keeps config-only reports visible', () => {
    const rows = buildMappableReports([], [
      { report_key: 'legacy', report_name: 'Legacy Report', view_roles: ['admin'], download_roles: [] },
    ]);
    expect(rows.map(r => r.report_key)).toEqual(['legacy']);
  });

  it('falls back to admin-only for unknown report keys', () => {
    expect(getDefaultReportAccess('brand-new')).toEqual({ view_roles: ['admin'], download_roles: ['admin'] });
  });
});
