import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * ADR-137 regression: when the just-submitted reviewer stage is deduped away
 * by the effective-chain resolver because the SAME reviewer also holds a
 * higher stage, `advance_annual_review_status` must mirror the locked
 * response onto the surviving terminal role so the ADR-127b completion
 * guard sees evidence and does not raise.
 *
 * Guards against the "cannot complete instance — bu_head has no locked
 * response" toast reported for Brundaban Chandra Das (dept_head_id ==
 * bu_head_id).
 */
describe('ADR-137 duplicate-reviewer collapse', () => {
  const dir = path.resolve(__dirname, '../../../supabase/migrations');
  const migrations = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const mirrorMigration = migrations
    .map((f) => ({ f, body: fs.readFileSync(path.join(dir, f), 'utf8') }))
    .reverse()
    .find((x) =>
      /CREATE OR REPLACE FUNCTION public\.advance_annual_review_status/.test(x.body) &&
      /ADR-137/.test(x.body),
    );

  it('latest advance_annual_review_status ships the ADR-137 mirror', () => {
    expect(mirrorMigration, 'no migration defines ADR-137 advance RPC').toBeTruthy();
    const body = mirrorMigration!.body;
    // Mirror the locked response onto the surviving terminal role.
    expect(body).toMatch(/INSERT INTO public\.annual_review_responses[\s\S]+ON CONFLICT \(instance_id, reviewer_role\) DO UPDATE/);
    // Audit trail for the mirror.
    expect(body).toMatch(/annual_review\.duplicate_reviewer_mirror/);
    // Safety guard: only mirror when the terminal reviewer equals the caller.
    expect(body).toMatch(/v_terminal_reviewer\s*<>\s*v_caller/);
  });

  it('same migration normalises currently-stuck duplicate-collapse instances', () => {
    const body = mirrorMigration!.body;
    expect(body).toMatch(/overall_status\s*=\s*'pending_dept'[\s\S]+dept_head_id\s*=\s*bu_head_id/);
    expect(body).toMatch(/annual_review\.bu_terminal_normalized/);
  });
});