import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * ADR-098 / POLICY §88.1.d guard.
 *
 * `public.bulk_write_stage_scores` MUST mirror the achievement value onto
 * `<stage>_achieved_value` in the SAME UPDATE that stamps the per-stage
 * score, for every reviewer stage. Without the mirror, the Review Journey
 * card for that stage (which reads `<stage>_achieved_value` per §88) shows
 * a stale value while the score/rating already reflect the new achievement.
 *
 * This test introspects the latest migration body that defines
 * `bulk_write_stage_scores` (per Migration Governance, that body IS the
 * deployed contract) and asserts each reviewer-stage UPDATE writes its
 * own `<stage>_achieved_value` column.
 */
describe('ADR-098 bulk_write_stage_scores per-stage achieved-value mirror', () => {
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  const matches = files.filter(f => {
    const body = readFileSync(join(dir, f), 'utf8');
    return /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.bulk_write_stage_scores/i.test(body);
  });
  const latest = matches.at(-1);
  const body = latest ? readFileSync(join(dir, latest), 'utf8') : '';

  it('a bulk_write_stage_scores definition exists', () => {
    expect(matches.length).toBeGreaterThan(0);
  });

  const stages: Array<{ stage: string; col: string }> = [
    { stage: 'manager', col: 'manager_achieved_value' },
    { stage: 'skip_level', col: 'skip_level_achieved_value' },
    { stage: 'hr_pms', col: 'hr_pms_achieved_value' },
    { stage: 'auditor', col: 'auditor_achieved_value' },
    // functional_manager has no dedicated achieved-value column in the schema;
    // it inherits the top-level achieved_value. Re-check if/when added.
  ];

  for (const { stage, col } of stages) {
    it(`writes ${col} in the ${stage} stage UPDATE`, () => {
      // Find the UPDATE block keyed by `<stage>_score = v_score` and assert
      // it also assigns <stage>_achieved_value =.
      const re = new RegExp(
        `${stage}_score\\s*=\\s*v_score[\\s\\S]{0,1200}?${col}\\s*=`,
        'i',
      );
      expect(body, `Latest ${latest} is missing ${col} mirror in ${stage} branch`).toMatch(re);
    });
  }

  it('audit log carries mirrored_achieved_value + ADR-098 policy tag', () => {
    expect(body).toMatch(/mirrored_achieved_value/);
    expect(body).toMatch(/ADR-098/);
  });
});