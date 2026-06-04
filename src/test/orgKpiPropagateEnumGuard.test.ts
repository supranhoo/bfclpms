import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ADR-059 guard.
 * `public.kpis.status` uses the enum `public.review_status`. There is no
 * `workflow_status` type. The propagate RPC must keep casting to
 * `review_status` — otherwise Postgres aborts the propagation with
 * "type \"workflow_status\" does not exist".
 */
describe('ADR-059 propagate_org_kpi_value enum cast contract', () => {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const propagateFiles = files.filter((f) => {
    const body = readFileSync(join(dir, f), 'utf8');
    return /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.propagate_org_kpi_value/i.test(body);
  });
  const latest = propagateFiles.at(-1);
  const latestBody = latest ? readFileSync(join(dir, latest), 'utf8') : '';

  // Migrations are immutable per Migration Governance; only the latest
  // definition body is the deployed contract.
  it('latest propagate_org_kpi_value does NOT cast to the non-existent workflow_status enum', () => {
    expect(latestBody, `Latest definition (${latest}) still casts to workflow_status`)
      .not.toMatch(/::\s*workflow_status\b/);
  });

  it('latest propagate_org_kpi_value definition casts to review_status', () => {
    expect(propagateFiles.length).toBeGreaterThan(0);
    expect(latestBody).toMatch(/::\s*(public\.)?review_status\b/);
  });
});