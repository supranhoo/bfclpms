import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-199 / POLICY §RPT-EMPLOYEE-STATUS-FILTER — drift guard.
 * Every employee-keyed report must mount <EmployeeStatusFilter />.
 */
const REPORTS = [
  'CompletionReport', 'DepartmentReport', 'PerformanceReport', 'QueryReport',
  'KRAIssuance', 'KpiDetailReport', 'MonthlyScorecardReport', 'KpiScorecardDetail',
  'VarianceReport', 'ManagerTeamKpiReport', 'TeamVsManagerScoreReport',
  'KpiEmployeeMatrix', 'TNIReport', 'FirstKraRolloutReport', 'CustomReport',
  'KpiStatusTracker',
];

const read = (name: string) =>
  readFileSync(join(process.cwd(), 'src/pages/reports', `${name}.tsx`), 'utf8');

describe('employee status filter coverage', () => {
  it.each(REPORTS)('%s mounts EmployeeStatusFilter', (name) => {
    expect(read(name)).toContain('<EmployeeStatusFilter');
  });

  it.each(REPORTS)('%s reads the shared status mode', (name) => {
    const src = read(name);
    expect(
      src.includes('useEmployeeStatusFilter') ||
        src.includes('emp_status') ||
        src.includes('setEmpStatus'),
    ).toBe(true);
  });
});
