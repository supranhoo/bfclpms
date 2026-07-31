import { describe, it, expect } from 'vitest';
import {
  buildEmployeeOverrideRows,
  buildResolvedEmployeeRows,
  unresolvedCount,
  resolveGlobalTemplate,
  unresolvedMarker,
  type ExportConfig,
  type ExportTemplate,
} from '@/lib/reports/workflowConfigExportRows';
import { buildResolverContext, type ResolverProfile } from '@/lib/workflowResolver';

const EMP = 'aaaaaaaa-1111-4111-8111-111111111111';
const MGR = 'bbbbbbbb-2222-4222-8222-222222222222';
const SKIP = 'cccccccc-3333-4333-8333-333333333333';
const GHOST = 'dddddddd-4444-4444-8444-444444444444';
const DEPT = 'eeeeeeee-5555-4555-8555-555555555555';

function profile(over: Partial<ResolverProfile> & { id: string }): ResolverProfile {
  return {
    full_name: 'Test User',
    email: 'test@example.com',
    employee_code: '100001',
    pms_grade: 'G3',
    department_id: DEPT,
    reporting_manager_id: null,
    functional_manager_id: null,
    is_active: true,
    ...over,
  };
}

const employee = profile({ id: EMP, full_name: 'Anup Kumar', employee_code: '101381', email: 'anup@x.com', reporting_manager_id: MGR });
const manager = profile({ id: MGR, full_name: 'Awadhesh Kumar Singh', employee_code: '100100', reporting_manager_id: SKIP });
const skip = profile({ id: SKIP, full_name: 'Umesh Mehta', employee_code: '100200' });

const roster = [employee, manager, skip];
const profilesById = new Map(roster.map(p => [p.id, p]));

const template: ExportTemplate = {
  id: 'tpl-1',
  display_name: 'Standard 3-Stage',
  stages: ['self_review', 'manager_check', 'approved'],
  is_default: true,
  is_active: true,
};
const templatesById = new Map([[template.id, template]]);
const departmentsById = new Map([[DEPT, 'Operations']]);

const stageLabel = (s: string) => s;
const monthOf = () => 'All Months';

const cfg = (over: Partial<ExportConfig>): ExportConfig => ({
  config_type: 'employee',
  config_value: EMP,
  workflow_template_id: 'tpl-1',
  review_period: null,
  review_year: null,
  ...over,
});

describe('Workflow Configuration export rows (ADR-214)', () => {
  it('resolves employee, manager and skip-level names from the roster', () => {
    const [row] = buildEmployeeOverrideRows({
      configs: [cfg({})], profilesById, templatesById, departmentsById, stageLabel, monthOf,
    });
    expect(row['Employee Name']).toBe('Anup Kumar');
    expect(row['Employee Code']).toBe('101381');
    expect(row['Email']).toBe('anup@x.com');
    expect(row['Department']).toBe('Operations');
    expect(row['Reporting Manager']).toBe('Awadhesh Kumar Singh');
    expect(row['Skip-Level Manager']).toBe('Umesh Mehta');
    expect(row['Assigned Template']).toBe('Standard 3-Stage');
    expect(row['Employee Status']).toBe('Active');
  });

  it('flags an unmatched override instead of printing a silent em dash (the 31-Jul-2026 defect)', () => {
    const [row] = buildEmployeeOverrideRows({
      configs: [cfg({ config_value: GHOST })], profilesById, templatesById, departmentsById, stageLabel, monthOf,
    });
    expect(row['Employee Name']).toBe(unresolvedMarker(GHOST));
    expect(row['Employee Name']).not.toBe('—');
    expect(row['Employee Code']).toContain('Unresolved');
  });

  it('counts unresolved override rows so the sheet can carry a warning', () => {
    const configs = [cfg({}), cfg({ config_value: GHOST }), cfg({ config_type: 'department', config_value: DEPT })];
    expect(unresolvedCount(configs, profilesById)).toBe(1);
    expect(unresolvedCount(configs, new Map())).toBe(2);
  });

  it('an empty roster yields only unresolved rows — the abort guard must prevent shipping this', () => {
    const rows = buildEmployeeOverrideRows({
      configs: [cfg({}), cfg({ config_value: MGR })],
      profilesById: new Map(), templatesById, departmentsById, stageLabel, monthOf,
    });
    expect(rows.every(r => r['Employee Name'].startsWith('Unresolved'))).toBe(true);
    expect(unresolvedCount([cfg({}), cfg({ config_value: MGR })], new Map())).toBe(2);
  });

  it('honours template precedence: employee > department > pms_grade > default', () => {
    const other: ExportTemplate = { id: 'tpl-2', display_name: 'Dept Template', stages: ['self_review'] };
    const map = new Map([...templatesById, [other.id, other]]);
    expect(resolveGlobalTemplate(employee, [cfg({ workflow_template_id: 'tpl-2' })], map, template).source).toBe('employee');
    expect(resolveGlobalTemplate(employee, [cfg({ config_type: 'department', config_value: DEPT, workflow_template_id: 'tpl-2' })], map, template).template?.id).toBe('tpl-2');
    expect(resolveGlobalTemplate(employee, [cfg({ config_type: 'pms_grade', config_value: 'G3', workflow_template_id: 'tpl-2' })], map, template).source).toBe('pms_grade');
    expect(resolveGlobalTemplate(employee, [], map, template).source).toBe('default');
  });

  it('ignores period-specific configs in the global resolved sheet', () => {
    const other: ExportTemplate = { id: 'tpl-2', display_name: 'July Only', stages: ['self_review'] };
    const map = new Map([...templatesById, [other.id, other]]);
    const res = resolveGlobalTemplate(employee, [cfg({ workflow_template_id: 'tpl-2', review_period: 'July' })], map, template);
    expect(res.source).toBe('default');
    expect(res.template?.id).toBe('tpl-1');
  });

  it('does not present an inactive manager as a live reviewer', () => {
    const inactiveMgr = { ...manager, is_active: false };
    const pool = [employee, inactiveMgr, skip];
    const ctx = buildResolverContext(pool, []);
    const [row] = buildResolvedEmployeeRows({
      profiles: [employee], configs: [], templatesById, departmentsById, defaultTemplate: template, ctx,
    });
    expect(row['L1 Manager']).toMatch(/^N\/A/);
    expect(row['Has N/A']).toBe('Yes');
  });

  it('marks inactive employees in the resolved sheet', () => {
    const ctx = buildResolverContext(roster, []);
    const [row] = buildResolvedEmployeeRows({
      profiles: [{ ...employee, is_active: false }], configs: [], templatesById, departmentsById, defaultTemplate: template, ctx,
    });
    expect(row['Employee Status']).toBe('Inactive');
  });
});
