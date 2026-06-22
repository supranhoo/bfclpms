/**
 * v2.66.11.11 — Team Reviews zero-state diagnostic.
 * Tests the pure decision tree exposed by `diagnoseEmptyTeam`.
 */
import { describe, it, expect } from 'vitest';
import { diagnoseEmptyTeam } from '@/components/review/TeamReviewsZeroDiagnostic';

const base = { selectedPeriod: 'Apr', selectedYear: 2026, totalEmployees: 0 };

describe('diagnoseEmptyTeam (v2.66.11.11)', () => {
  it('flags no_reports_mapped when both rosters are empty', () => {
    const d = diagnoseEmptyTeam({ ...base, directCount: 0, skipCount: 0, periodKpiCount: 0 });
    expect(d.code).toBe('no_reports_mapped');
    expect(d.message).toMatch(/User Management/);
  });

  it('flags reports_without_kpis when reports exist but no KPIs in period', () => {
    const d = diagnoseEmptyTeam({ ...base, directCount: 3, skipCount: 1, periodKpiCount: 0 });
    expect(d.code).toBe('reports_without_kpis');
    expect(d.message).toMatch(/4 reports/);
    expect(d.message).toMatch(/Apr 2026/);
    expect(d.message).toMatch(/KRA Issuance/);
  });

  it('singularises "1 report" correctly', () => {
    const d = diagnoseEmptyTeam({ ...base, directCount: 1, skipCount: 0, periodKpiCount: 0 });
    expect(d.message).toMatch(/1 report mapped/);
  });

  it('flags kpis_filtered_out when KPIs exist but none match filters', () => {
    const d = diagnoseEmptyTeam({ ...base, directCount: 5, skipCount: 0, periodKpiCount: 12 });
    expect(d.code).toBe('kpis_filtered_out');
    expect(d.message).toMatch(/clearing filters|switching the status tile/);
  });

  it('returns a stable shape regardless of branch', () => {
    const d = diagnoseEmptyTeam({ ...base, directCount: 0, skipCount: 0, periodKpiCount: 0 });
    expect(d).toHaveProperty('code');
    expect(d).toHaveProperty('title');
    expect(d).toHaveProperty('message');
  });

  it('flags data_load_error when an upstream query failed (v2.66.11.13)', () => {
    const d = diagnoseEmptyTeam({
      ...base,
      directCount: 13,
      skipCount: 172,
      periodKpiCount: 0,
      dataLoadError: true,
    });
    expect(d.code).toBe('data_load_error');
    expect(d.title).toMatch(/could not be loaded/i);
  });

  /**
   * v2.66.11.16 (POLICY §128) — Sajid Raza RCA continuation.
   * Secondary KPI / submission-score query failures must NOT escalate to
   * the dashboard-wide fatal state. The caller is now responsible for
   * passing `dataLoadError = false` whenever only secondary queries fail
   * so the diagnostic falls through to the period-specific "no KPIs"
   * message and the roster remains usable.
   */
  it('does not escalate to data_load_error for secondary KPI failures (v2.66.11.16)', () => {
    const d = diagnoseEmptyTeam({
      ...base,
      directCount: 13,
      skipCount: 0,
      periodKpiCount: 0,
      // caller passes false because only periodKpisError / submissionScoresError flipped
      dataLoadError: false,
    });
    expect(d.code).not.toBe('data_load_error');
    expect(d.code).toBe('reports_without_kpis');
  });
});