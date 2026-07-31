import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ADR-216 / POLICY §AR-STAGE-UPDATE-EFFECTIVE-CHAIN.
 *
 * The `instances_stage_update` RLS policy must resolve the permitted
 * destination status through the EFFECTIVE chain (duplicate / absent
 * reviewers skipped) — the same SSOT `advance_annual_review_status` uses.
 * Using raw `enabled_stages` alone breaks submission whenever two
 * consecutive stages share a reviewer (e.g. dept_head_id = bu_head_id).
 */
describe('instances_stage_update policy ↔ effective chain SSOT', () => {
  const dir = resolve(__dirname, '../../../supabase/migrations');
  const latest = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(resolve(dir, f), 'utf8'))
    .filter((b) => b.includes('CREATE POLICY instances_stage_update'))
    .pop();

  it('has a migration defining the policy', () => {
    expect(latest, 'no migration defines instances_stage_update').toBeTruthy();
  });

  it('derives the next status from the effective chain', () => {
    expect(latest).toContain('annual_review_allowed_next_status');
  });

  const SLOTS = [
    'pending_self',
    'pending_manager',
    'pending_skip',
    'pending_dept',
    'pending_bu',
    'pending_hr',
    'pending_management',
  ] as const;

  it.each(SLOTS)('covers %s via the effective-chain resolver', (slot) => {
    expect(latest).toContain(`annual_review_allowed_next_status(id, '${slot}'`);
  });
});
