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
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));

  it('no migration casts to the non-existent workflow_status enum', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const body = readFileSync(join(dir, f), 'utf8');
      if (/::\s*workflow_status\b/.test(body)) offenders.push(f);
    }
    expect(offenders, `Migrations still casting to workflow_status: ${offenders.join(', ')}`).toEqual([]);
  });

  it('latest propagate_org_kpi_value definition casts to review_status', () => {
    const propagateFiles = files.filter((f) => {
      const body = readFileSync(join(dir, f), 'utf8');
      return /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.propagate_org_kpi_value/i.test(body);
    });
    expect(propagateFiles.length).toBeGreaterThan(0);
    // Take the lexicographically last (newest timestamp prefix) — that is the
    // currently-deployed body.
    const latest = propagateFiles.sort().at(-1)!;
    const body = readFileSync(join(dir, latest), 'utf8');
    expect(body).toMatch(/::\s*(public\.)?review_status\b/);
  });
});