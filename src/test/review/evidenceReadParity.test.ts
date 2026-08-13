import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-256 / POLICY §EVIDENCE-READ-KPI-PARTICIPATION.
 *
 * Parity guard: the set of users allowed to OPEN a KPI's evidence file
 * (`can_read_kpi_evidence`) must equal the set allowed to SEE the KPI row
 * (`can_view_kpi_row`). Regression: Management / HR PMS / skip-level manager /
 * functional manager / org-KPI data owners could see the attachment chip but
 * were denied by Storage RLS.
 */
const MIG_DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();

function latestDefinitionOf(fnName: string): string {
  let found = '';
  for (const f of files) {
    const sql = readFileSync(join(MIG_DIR, f), 'utf8');
    const re = new RegExp(
      `CREATE OR REPLACE FUNCTION public\\.${fnName}\\s*\\(([\\s\\S]*?)\\$function\\$;`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) found = m[0];
  }
  return found;
}

describe('ADR-256 evidence read parity', () => {
  const body = latestDefinitionOf('can_read_kpi_evidence');

  it('has a current definition in migrations', () => {
    expect(body.length).toBeGreaterThan(0);
  });

  it('grants every global role that can view a KPI row', () => {
    for (const role of ['admin', 'auditor', 'hr_pms', 'management']) {
      expect(body).toContain(`'${role}'::public.app_role`);
    }
    expect(body).toContain('has_report_access_override');
  });

  it('covers reporting, functional and skip-level managers', () => {
    expect(body).toMatch(/emp\.reporting_manager_id = _uid/);
    expect(body).toMatch(/emp\.functional_manager_id = _uid/);
    expect(body).toMatch(/get_skip_level_manager\(_employee_id\)/);
  });

  it('keeps auditor assignments, mentions and org-KPI ownership', () => {
    expect(body).toContain('audit_kpi_assignments');
    expect(body).toContain('audit_kpi_level_assignments');
    expect(body).toContain('kpi_mention_access');
    expect(body).toContain('org_kpi_data_owners');
  });

  it('stays SECURITY DEFINER with a pinned search_path', () => {
    expect(body).toMatch(/SECURITY DEFINER/i);
    expect(body).toMatch(/SET search_path TO 'public'/i);
  });

  it('denies anonymous callers', () => {
    expect(body).toMatch(/_uid IS NULL/);
  });
});
