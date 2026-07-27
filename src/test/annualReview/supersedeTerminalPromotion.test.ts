import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

/** Latest migration that (re)defines the 4-arg supersede-capable workflow RPC. */
function latestSupersedeFunction(): string {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .map((file) => readFileSync(resolve(migrationsDir, file), 'utf8'))
    .find((sql) => sql.includes('p_mode text DEFAULT')) ?? '';
}

/**
 * ADR-183 — POLICY §AR-SUPERSEDE-NO-FALSE-REWIND.
 *
 * Removing a downstream stage from an already-actioned chain must NOT rewind
 * onto a stage that already has a locked response, and must NOT erase the
 * finalized aggregates. When every remaining enabled stage is actioned the
 * instance is terminal → `completed` with recomputed aggregates.
 */
describe('ADR-183 supersede terminal promotion', () => {
  const sql = latestSupersedeFunction();

  it('resolves the next stage by skipping stages that already have a locked response', () => {
    expect(sql).toContain('NOT EXISTS (');
    expect(sql).toMatch(/FROM public\.annual_review_responses r/);
    expect(sql).toMatch(/r\.is_locked = true/);
    expect(sql).toMatch(/r\.reviewer_role::text = s\.role/);
  });

  it('orders candidate stages canonically instead of taking an arbitrary LIMIT 1', () => {
    expect(sql).toContain('ORDER BY s.ord');
    for (const [role, ord] of [
      ['self', 1],
      ['manager', 2],
      ['skip_manager', 3],
      ['dept_head', 4],
      ['bu_head', 5],
      ['hr', 6],
      ['management', 7],
    ] as const) {
      expect(sql).toMatch(new RegExp(`WHEN '${role}'\\s+THEN ${ord}`));
    }
  });

  it('promotes to completed when no enabled stage is left unactioned', () => {
    expect(sql).toContain("v_new_status := 'completed'::public.annual_review_status;");
  });

  it('recomputes aggregates on promotion instead of nulling them', () => {
    expect(sql).toContain('annual_review_compute_final_summary(p_instance_id)');
    expect(sql).toMatch(/total_score\s*=\s*v_sum\.total_score/);
    expect(sql).toMatch(/final_rating\s*=\s*v_sum\.final_rating/);
    expect(sql).toMatch(/criteria_weighted_score\s*=\s*v_sum\.criteria_weighted_score/);
  });

  it('only clears scores on the pending branch', () => {
    const clearIdx = sql.indexOf('SET total_score = NULL');
    const branchIdx = sql.indexOf("IF v_new_status = 'completed'::public.annual_review_status THEN");
    expect(branchIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(branchIdx); // clearing lives in the ELSE branch
  });

  it('still archives only responses belonging to removed stages', () => {
    expect(sql).toContain('reviewer_role::text = ANY(v_removed_roles)');
  });

  it('uses canonical pending status names', () => {
    expect(sql).not.toContain('pending_dept_head');
    expect(sql).not.toContain('pending_bu_head');
  });
});