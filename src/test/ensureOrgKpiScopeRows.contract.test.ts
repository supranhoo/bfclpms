import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Static contract test for the ensure_org_kpi_scope_rows RPC.
 * Guards key behaviors against regression in future migrations.
 */
function loadLatestEnsureRpc(): string {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.ensure_org_kpi_scope_rows/i.test(body)) {
      return body;
    }
  }
  throw new Error('No migration defining ensure_org_kpi_scope_rows found');
}

describe('ensure_org_kpi_scope_rows RPC contract', () => {
  const sql = loadLatestEnsureRpc();

  it('is SECURITY DEFINER with locked search_path', () => {
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
    expect(sql).toMatch(/SET\s+search_path\s+TO\s+'public'/i);
  });

  it('gates execution on admin OR data-owner', () => {
    expect(sql).toMatch(/has_role\(v_user,\s*'admin'::app_role\)/);
    expect(sql).toMatch(/org_kpi_data_owners/);
    expect(sql).toMatch(/Not authorized to materialise org KPI scope rows/);
  });

  it('inserts with ON CONFLICT DO NOTHING to be idempotent', () => {
    expect(sql).toMatch(/ON\s+CONFLICT[\s\S]*?DO\s+NOTHING/i);
  });

  it('only seeds evidence when OKV row has no existing evidence', () => {
    // Guard: evidence seed branch must check existing url and urls are empty
    expect(sql).toMatch(/v_existing_url\s+IS\s+NULL/);
    expect(sql).toMatch(/jsonb_array_length\(COALESCE\(v_existing_urls/);
  });

  it('returns created / evidence_seeded / already_existed counters', () => {
    expect(sql).toMatch(/'created'/);
    expect(sql).toMatch(/'evidence_seeded'/);
    expect(sql).toMatch(/'already_existed'/);
  });

  it('only iterates org-level KPIs for the requested period/year', () => {
    expect(sql).toMatch(/k\.is_org_level\s*=\s*true/);
    expect(sql).toMatch(/k\.review_period\s*=\s*p_review_period/);
    expect(sql).toMatch(/k\.review_year\s*=\s*p_review_year/);
  });

  it('grants EXECUTE to authenticated', () => {
    expect(sql).toMatch(/GRANT\s+EXECUTE[\s\S]*ensure_org_kpi_scope_rows[\s\S]*TO\s+authenticated/i);
  });
});
