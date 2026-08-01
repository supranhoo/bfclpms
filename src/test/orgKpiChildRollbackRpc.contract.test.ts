import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ADR-227 — static contract guard for
 * public.rollback_org_kpi_propagation_by_children.
 */
const MIGRATIONS_DIR = 'supabase/migrations';
const FILES = readdirSync(MIGRATIONS_DIR).sort();

function latestDefinition(): string {
  for (let i = FILES.length - 1; i >= 0; i--) {
    const body = readFileSync(join(MIGRATIONS_DIR, FILES[i]), 'utf8');
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.rollback_org_kpi_propagation_by_children/i.test(body)) {
      return body;
    }
  }
  throw new Error('No migration defines rollback_org_kpi_propagation_by_children');
}

describe('rollback_org_kpi_propagation_by_children contract', () => {
  const sql = latestDefinition();

  it('is SECURITY DEFINER with a locked search_path', () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s+TO\s+'public'/i);
  });

  it('gates on admin OR data owner and requires a reason', () => {
    expect(sql).toMatch(/has_role\(v_user,\s*'admin'::app_role\)/);
    expect(sql).toMatch(/org_kpi_data_owners/);
    expect(sql).toMatch(/Not authorized to roll back this org KPI/);
    expect(sql).toMatch(/at least 3 characters/);
  });

  it('derives the work list from child kpis, not master status', () => {
    expect(sql).toMatch(/FROM\s+public\.kpis\s+k[\s\S]{0,200}is_org_level\s*=\s*true/);
    expect(sql).not.toMatch(/No propagated scopes/);
  });

  it('excludes approved / management_review cells', () => {
    expect(sql).toMatch(/'approved'::review_status/);
    expect(sql).toMatch(/'management_review'::review_status/);
  });

  it('audits the run and grants EXECUTE to authenticated', () => {
    expect(sql).toMatch(/org_kpi_data_entry_logs/);
    expect(sql).toMatch(/bulk_rollback_children/);
    expect(sql).toMatch(/GRANT\s+EXECUTE[\s\S]{0,200}rollback_org_kpi_propagation_by_children[\s\S]{0,120}TO\s+authenticated/i);
  });
});
