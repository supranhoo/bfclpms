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
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));

  it('no migration casts to the non-existent workflow_stage type', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(dir, f), 'utf8');
      if (/::\s*workflow_stage\b/.test(body)) offenders.push(f);
    }
    expect(offenders, `Still casting to workflow_stage: ${offenders.join(', ')}`).toEqual([]);
  });

  it("no migration writes the invalid 'approved'::kpi_status token", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(dir, f), 'utf8');
      if (/'approved'\s*::\s*(public\.)?kpi_status\b/.test(body)) offenders.push(f);
    }
    expect(offenders, `Invalid 'approved'::kpi_status in: ${offenders.join(', ')}`).toEqual([]);
  });

  it('latest bulk_management_approve uses locked::kpi_status and approved::review_status', () => {
    const matches = files.filter((f) => {
      const body = readFileSync(join(dir, f), 'utf8');
      return /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.bulk_management_approve/i.test(body);
    });
    expect(matches.length).toBeGreaterThan(0);
    const latest = matches.sort().at(-1)!;
    const body = readFileSync(join(dir, latest), 'utf8');
    expect(body).toMatch(/'locked'\s*::\s*(public\.)?kpi_status\b/);
    expect(body).toMatch(/'approved'\s*::\s*(public\.)?review_status\b/);
  });
});