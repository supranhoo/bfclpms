import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * ADR-064 contract lock.
 *
 * Ensures the latest `propagate_org_kpi_value` migration carries the
 * `overwrite_and_stepback` policy with the expected semantics:
 *   - excludes 'approved' (immutability)
 *   - step-back target is 'self_review'
 *   - unconditional self_* overwrite when policy is active
 *   - audit metadata records prior status / score / remarks / evidence
 *   - reviewer columns (manager / auditor / skip / hr / management) are cleared
 *   - preview RPC accepts the same policy
 */
function latestMigrationContaining(needle: string): string {
  const dir = join(process.cwd(), 'supabase/migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(dir, files[i]), 'utf8');
    if (body.includes(needle)) return body;
  }
  throw new Error(`No migration contains: ${needle}`);
}

describe('ADR-064 propagate_org_kpi_value overwrite_and_stepback', () => {
  const propagateBody = latestMigrationContaining(
    "CREATE OR REPLACE FUNCTION public.propagate_org_kpi_value",
  );
  const previewBody = latestMigrationContaining(
    "CREATE OR REPLACE FUNCTION public.preview_org_kpi_propagation",
  );

  it('lists overwrite_and_stepback in the allowed policy set', () => {
    expect(propagateBody).toMatch(/overwrite_and_stepback/);
    expect(propagateBody).toMatch(/v_policy NOT IN \([^)]*overwrite_and_stepback[^)]*\)/);
  });

  it('excludes approved rows under overwrite_and_stepback (immutability)', () => {
    expect(propagateBody).toMatch(/overwrite_and_stepback'\s+THEN v_current_status <> 'approved'/);
    expect(propagateBody).toMatch(/approved_immutable/);
  });

  it("steps back rows past self_review to 'self_review'", () => {
    expect(propagateBody).toMatch(/v_step_back\s*:=\s*v_overwrite_mode AND v_current_status = ANY\(v_stages_after_self_review\)/);
    expect(propagateBody).toMatch(/WHEN v_step_back THEN 'self_review'/);
  });

  it('clears reviewer columns at all downstream stages on step-back', () => {
    for (const col of [
      'manager_score', 'manager_remarks',
      'auditor_score', 'auditor_remarks',
      'skip_level_score', 'skip_level_remarks',
      'hr_pms_score', 'hr_pms_remarks',
      'management_score', 'management_remarks',
      'final_score',
    ]) {
      expect(propagateBody).toMatch(new RegExp(`${col}\\s*=\\s*NULL`));
    }
  });

  it('overwrites self_* unconditionally when policy is active', () => {
    expect(propagateBody).toMatch(/WHEN v_overwrite_mode THEN EXCLUDED\.self_evidence_urls/);
    expect(propagateBody).toMatch(/WHEN v_overwrite_mode THEN EXCLUDED\.self_remarks/);
    expect(propagateBody).toMatch(/WHEN v_overwrite_mode THEN EXCLUDED\.self_evidence_url\b/);
  });

  it('writes ORG_KPI_VALUE_OVERWRITTEN audit with prior state', () => {
    expect(propagateBody).toMatch(/'ORG_KPI_VALUE_OVERWRITTEN'/);
    for (const k of ['prior_status', 'prior_self_remarks', 'prior_self_evidence_urls', 'step_back', 'overwrite_policy']) {
      expect(propagateBody).toMatch(new RegExp(`'${k}'`));
    }
  });

  it('preview RPC accepts overwrite_and_stepback and labels approved as immutable', () => {
    expect(previewBody).toMatch(/overwrite_and_stepback/);
    expect(previewBody).toMatch(/approved_immutable/);
  });
});