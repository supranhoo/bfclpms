import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Pins the SQL contract added in v2.66.13.6 (POLICY §111.7.a):
// bulk_write_stage_scores must persist the shared remark AND optional
// shared evidence onto the acted stage's columns, not just batch metadata.
const SQL = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260525110633_bulk_write_stage_scores_v2.sql',
  ),
  'utf8',
).toLowerCase();

describe('bulk_write_stage_scores SQL contract', () => {
  it('declares the v2 signature with p_attachment_urls', () => {
    expect(SQL).toMatch(/p_attachment_urls\s+jsonb\s+default/);
  });

  it('enforces a minimum shared remark length', () => {
    expect(SQL).toMatch(/length\(v_shared_remark\)\s*<\s*10/);
  });

  it('writes effective remarks onto every stage remark column', () => {
    for (const col of [
      'manager_remarks',
      'skip_level_remarks',
      'hr_pms_remarks',
      'auditor_remarks',
    ]) {
      expect(SQL).toMatch(new RegExp(`${col}\\s*=\\s*v_effective_remarks`));
    }
  });

  it('merges shared evidence into every stage evidence_urls column', () => {
    for (const col of [
      'manager_evidence_urls',
      'skip_level_evidence_urls',
      'hr_pms_evidence_urls',
      'auditor_evidence_urls',
    ]) {
      expect(SQL).toMatch(new RegExp(`${col}\\s*=`));
    }
    expect(SQL).toMatch(/v_attach_count\s*>\s*0/);
  });

  it('still calls the workflow reconciler after writes', () => {
    expect(SQL).toMatch(/reconcile_workflow_statuses/);
  });
});