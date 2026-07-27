import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

/** Latest migration that installs the ADR-184 downstream-rewind guard. */
function adr184Migration(): string {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .reverse()
    .map((f) => readFileSync(resolve(migrationsDir, f), 'utf8'))
    .find((sql) => sql.includes('tg_ar_no_downstream_rewind')) ?? '';
}

/**
 * ADR-184 — POLICY §AR-REPAIR-NO-DOWNSTREAM-REWIND.
 *
 * An empty upstream stage must never be reopened once a later enabled stage has
 * a locked response; the instance stays terminal and its aggregates are
 * recomputed, never nulled. ADR-172 submission-time enforcement is preserved.
 */
describe('ADR-184 no downstream rewind', () => {
  const sql = adr184Migration();

  it('installs the guard trigger on annual_review_instances', () => {
    expect(sql).toContain('CREATE TRIGGER trg_ar_no_downstream_rewind');
    expect(sql).toMatch(/BEFORE UPDATE OF overall_status ON public\.annual_review_instances/);
  });

  it('blocks a pending status when a later enabled stage holds a locked response', () => {
    expect(sql).toMatch(/r\.is_locked = true/);
    expect(sql).toMatch(/annual_review_stage_ord\(r\.reviewer_role::text\) > v_ord/);
    expect(sql).toMatch(/enabled_stages,'\[\]'::jsonb\) \? r\.reviewer_role::text/);
    expect(sql).toContain('ADR-184: cannot set instance');
  });

  it('exposes an explicit, named bypass for admin repair tooling only', () => {
    expect(sql).toContain("current_setting('annual_review.bypass_downstream_rewind_guard', true)");
  });

  it('uses canonical stage/status ordinals as the SQL SSOT', () => {
    for (const [role, ord] of [
      ['self', 1], ['manager', 2], ['skip_manager', 3], ['dept_head', 4],
      ['bu_head', 5], ['hr', 6], ['management', 7],
    ] as const) {
      expect(sql).toMatch(new RegExp(`WHEN '${role}' THEN ${ord}`));
    }
    expect(sql).toContain("WHEN 'pending_dept' THEN 4");
    expect(sql).not.toContain('pending_dept_head');
    expect(sql).not.toContain('pending_bu_head');
  });

  it('repair promotes to completed and recomputes aggregates instead of nulling them', () => {
    expect(sql).toContain("v_new_status := 'completed'::public.annual_review_status;");
    expect(sql).toContain('annual_review_compute_final_summary(p_instance_id)');
    expect(sql).toMatch(/total_score = v_sum\.total_score/);
    expect(sql).toMatch(/final_rating = v_sum\.final_rating/);
    expect(sql).toMatch(/criteria_weighted_score = v_sum\.criteria_weighted_score/);
    expect(sql).not.toMatch(/SET total_score = NULL/);
  });

  it('repair is admin/HR PMS only, needs a reason and writes an audit row', () => {
    expect(sql).toMatch(/has_role\(v_caller,'admin'\) OR public\.has_role\(v_caller,'hr_pms'\)/);
    expect(sql).toContain('Reason is required (min 3 characters).');
    expect(sql).toContain('annual_review_downstream_rewind_repair_2026_07');
    expect(sql).toContain("'annual_review.repair_downstream_rewind'");
  });

  it('keeps ADR-172 submission-time enforcement untouched', () => {
    expect(sql).not.toContain('DROP TRIGGER IF EXISTS trg_ar_stage_score_required');
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.tg_ar_stage_score_required/);
  });

  it('secures the repair audit table with RLS and grants', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/GRANT SELECT ON public\.annual_review_downstream_rewind_repair_2026_07 TO authenticated/);
    expect(sql).toMatch(/GRANT ALL ON public\.annual_review_downstream_rewind_repair_2026_07 TO service_role/);
  });
});