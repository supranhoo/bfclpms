import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ADR-066 guard.
 *
 * `public.bulk_management_approve` previously cast to two invalid enum tokens:
 *   - `'approved'::kpi_status`        → value not in `public.kpi_status`
 *   - `'approved'::workflow_stage`    → type does not exist
 *
 * The canonical terminal `review_submissions.kpi_status` is `'locked'`
 * (matches every other stage writer), and the canonical terminal
 * `kpis.status` cast is `'approved'::public.review_status` (ADR-059).
 */
describe('ADR-066 bulk_management_approve enum cast contract', () => {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  const matches = files.filter((f) => {
    const body = readFileSync(join(dir, f), 'utf8');
    return /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.bulk_management_approve/i.test(body);
  });
  const latest = matches.at(-1);
  const latestBody = latest ? readFileSync(join(dir, latest), 'utf8') : '';

  // Migrations are immutable per Migration Governance; only the latest
  // bulk_management_approve definition body is the deployed contract.
  it('a bulk_management_approve definition exists', () => {
    expect(matches.length).toBeGreaterThan(0);
  });

  it('latest bulk_management_approve does NOT cast to the non-existent workflow_stage type', () => {
    expect(latestBody, `Latest definition (${latest}) still casts to workflow_stage`)
      .not.toMatch(/::\s*workflow_stage\b/);
  });

  it("latest bulk_management_approve does NOT write the invalid 'approved'::kpi_status token", () => {
    expect(latestBody, `Latest definition (${latest}) still writes 'approved'::kpi_status`)
      .not.toMatch(/'approved'\s*::\s*(public\.)?kpi_status\b/);
  });

  it('latest bulk_management_approve uses locked::kpi_status and approved::review_status', () => {
    expect(latestBody).toMatch(/'locked'\s*::\s*(public\.)?kpi_status\b/);
    expect(latestBody).toMatch(/'approved'\s*::\s*(public\.)?review_status\b/);
  });
});