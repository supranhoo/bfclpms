/** ADR-319 — the scope vocabulary is the single source of truth for scope columns. */
import { describe, it, expect } from 'vitest';
import {
  KPI_SCOPES, toKpiScope, toKpiColumns, fromKpiColumns, kpiScopeLabel, KPI_SCOPE_COPY,
} from './kpiScope';

describe('kpiScope (ADR-319)', () => {
  it('maps every scope to its columns', () => {
    expect(toKpiColumns('individual')).toEqual({ is_org_level: false, org_level_scope: null });
    expect(toKpiColumns('organization')).toEqual({ is_org_level: true, org_level_scope: 'organization' });
    expect(toKpiColumns('department')).toEqual({ is_org_level: true, org_level_scope: 'department' });
    expect(toKpiColumns('employee')).toEqual({ is_org_level: true, org_level_scope: 'employee' });
  });

  it('accepts the legacy console kinds as aliases', () => {
    expect(toKpiScope('shared')).toBe('organization');
    expect(toKpiScope('department_event')).toBe('department');
    expect(toKpiScope('individual')).toBe('individual');
  });

  it('falls back to individual for unknown or missing values', () => {
    expect(toKpiScope(undefined)).toBe('individual');
    expect(toKpiScope('')).toBe('individual');
    expect(toKpiScope('nonsense')).toBe('individual');
  });

  it('round-trips columns back to the scope', () => {
    for (const s of KPI_SCOPES) {
      expect(fromKpiColumns(toKpiColumns(s))).toBe(s);
    }
  });

  it('treats a non-org-level row as individual even with a stale scope value', () => {
    expect(fromKpiColumns({ is_org_level: false, org_level_scope: 'organization' })).toBe('individual');
  });

  it('labels legacy words with the unified vocabulary', () => {
    expect(kpiScopeLabel('shared')).toBe('Organization');
    expect(kpiScopeLabel('department_event')).toBe('Department');
  });

  it('has copy for every scope', () => {
    for (const s of KPI_SCOPES) {
      expect(KPI_SCOPE_COPY[s].label.length).toBeGreaterThan(0);
      expect(KPI_SCOPE_COPY[s].hint.length).toBeGreaterThan(0);
    }
  });
});

// ADR-320 — grouped scopes must each name a target before they can be saved.
describe('ADR-320 grouped scope targeting', () => {
  it('requires a target for every grouped scope', () => {
    for (const scope of ['department', 'employee', 'business_unit', 'location', 'division', 'pms_grade', 'level']) {
      expect(scopeNeedsTarget(scope)).toBe(true);
    }
  });

  it('requires no target for individual and organization', () => {
    expect(scopeNeedsTarget('individual')).toBe(false);
    expect(scopeNeedsTarget('organization')).toBe(false);
    expect(scopeNeedsTarget(null)).toBe(false);
    expect(scopeNeedsTarget('nonsense')).toBe(false);
  });

  it('maps each grouped scope to exactly one distinct target column', () => {
    const grouped = ['department', 'employee', 'business_unit', 'location', 'division', 'pms_grade', 'level'] as const;
    const columns = grouped.map((s) => KPI_SCOPE_TARGET_COLUMNS[s]);
    expect(new Set(columns).size).toBe(grouped.length);
    expect(columns).not.toContain(null);
  });
});
