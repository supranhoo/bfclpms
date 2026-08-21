import { describe, it, expect } from 'vitest';
import { splitImpact, describeTable, describeOrgDeleteError, describeViaPath, cascadeSummaries, type OrgDeleteImpactRow } from '@/services/organization/orgMasterDelete';

const row = (over: Partial<OrgDeleteImpactRow>): OrgDeleteImpactRow => ({
  child_table: 'profiles',
  child_column: 'department_id',
  delete_action: 'a',
  row_count: 1,
  classification: 'blocking',
  labels: [],
  via_path: '',
  ...over,
});


describe('ADR-308 org master delete impact model', () => {
  it('splits blocking, cleanable and auto dependencies', () => {
    const rows = [
      row({}),
      row({ child_table: 'access_profile_org_scope', child_column: 'division_id', classification: 'cleanable', row_count: 3, labels: ['Auditor', 'Management', 'Onboarding'] }),
      row({ child_table: 'business_units', child_column: 'division_id', classification: 'auto', delete_action: 'c' }),
    ];
    const out = splitImpact(rows);
    expect(out.blocking).toHaveLength(1);
    expect(out.cleanable[0].row_count).toBe(3);
    expect(out.cleanable[0].labels).toEqual(['Auditor', 'Management', 'Onboarding']);
    expect(out.auto).toHaveLength(1);
  });

  it('CLU shape (only access-profile scope) is not blocking', () => {
    const out = splitImpact([
      row({ child_table: 'access_profile_org_scope', child_column: 'division_id', classification: 'cleanable', row_count: 3 }),
    ]);
    expect(out.blocking).toHaveLength(0);
  });

  it('clean record has no dependencies at all', () => {
    const out = splitImpact([]);
    expect(out.blocking).toHaveLength(0);
    expect(out.cleanable).toHaveLength(0);
  });

  it('never surfaces raw table names to users', () => {
    expect(describeTable('access_profile_org_scope')).toBe('Access profile visibility scope');
    expect(describeTable('some_new_table')).toBe('some new table');
  });

  it('maps known database failures to plain language', () => {
    expect(describeOrgDeleteError('update or delete on table "divisions" violates foreign key constraint "x"')).toMatch(/still linked to other data/i);
    expect(describeOrgDeleteError('Only administrators can delete organisation master records')).toMatch(/Only administrators/);
    expect(describeOrgDeleteError('Deleting "CLU" also removes 3 configuration reference(s). Confirm the cleanup option to proceed.')).toMatch(/Tick the cleanup option/);
    expect(describeOrgDeleteError('Record not found or already deleted')).toMatch(/no longer exists/);
    expect(describeOrgDeleteError('something odd')).toBe('something odd');
  });
});

describe('ADR-308a cascade-aware impact', () => {
  const hrShape = [
    row({ child_table: 'departments', child_column: 'business_unit_id', delete_action: 'c', classification: 'auto', row_count: 1 }),
    row({ child_table: 'org_kpi_values', child_column: 'department_id', classification: 'blocking', row_count: 2, via_path: 'departments "Executive"' }),
    row({ child_table: 'access_profile_org_scope', child_column: 'department_id', classification: 'cleanable', row_count: 3, via_path: 'departments "Executive"', labels: ['Auditor', 'Management', 'Onboarding'] }),
    row({ child_table: 'access_profile_org_scope', child_column: 'business_unit_id', classification: 'cleanable', row_count: 3, labels: ['Auditor', 'Management', 'Onboarding'] }),
  ];

  it('HR-HUMAN RESOURCES shape is blocked by its cascaded department', () => {
    const out = splitImpact(hrShape);
    expect(out.blocking).toHaveLength(1);
    expect(out.blocking[0].child_table).toBe('org_kpi_values');
    expect(out.blocking[0].via_path).toContain('Executive');
  });

  it('names the cascaded child in plain language', () => {
    expect(describeViaPath('departments "Executive"')).toBe('Departments: Executive');
    expect(describeViaPath('')).toBeNull();
    expect(cascadeSummaries(hrShape)).toEqual(['Departments: Executive']);
  });

  it('direct dependencies have no cascade path', () => {
    expect(cascadeSummaries([row({})])).toEqual([]);
  });
});

describe('ADR-308 server guard contract', () => {

  const sql = () => {
    const { readdirSync, readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const dir = join(process.cwd(), 'supabase', 'migrations');
    return readdirSync(dir).filter((f: string) => f.endsWith('.sql')).map((f: string) => readFileSync(join(dir, f), 'utf8')).join('\n');
  };

  it('guarded delete is admin-only, audited and search_path pinned', () => {
    const all = sql();
    expect(all).toContain('org_master_delete_impact');
    expect(all).toContain('org_master_delete_audit');
    expect(all).toMatch(/Only administrators can delete organisation master records/);
    expect(all).toMatch(/CREATE OR REPLACE FUNCTION public\.org_master_delete\(/);
  });

  it('impact report walks cascade descendants (ADR-308a)', () => {
    const all = sql();
    expect(all).toContain('org_master_delete_impact_at');
    expect(all).toMatch(/via_path/);
    expect(all).toMatch(/p_depth \+ 1/);
  });


  it('cleanable dependencies are configured in a table, not hardcoded in the UI', () => {
    expect(sql()).toContain('org_master_cleanable_dependencies');
  });
});
