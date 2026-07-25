import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsDir = resolve(process.cwd(), 'supabase/migrations');

function latestWorkflowStageFunction(): string {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .reverse()
    .map((file) => readFileSync(resolve(migrationsDir, file), 'utf8'))
    .find((sql) => sql.includes('CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages')) ?? '';
}

function generateCompletedReviewResetColumns(): string[] {
  return [
    'total_score',
    'final_rating',
    'criteria_weighted_score',
    'finalized_at',
    'finalized_by',
  ];
}

describe('ADR-169a completed Annual Review supersede reset', () => {
  const migration = latestWorkflowStageFunction();

  it('clears every real aggregate and finalization field', () => {
    for (const column of generateCompletedReviewResetColumns()) {
      expect(migration).toMatch(new RegExp(`${column}\\s*=\\s*NULL`));
    }
  });

  it('never writes historical phantom completion fields', () => {
    expect(migration).not.toContain('weighted_final_score');
    expect(migration).not.toContain('completed_at');
  });

  it('retains canonical Department and BU pending statuses', () => {
    expect(migration).toContain("WHEN 'dept_head'    THEN 'pending_dept'");
    expect(migration).toContain("WHEN 'bu_head'      THEN 'pending_bu'");
    expect(migration).not.toContain('pending_dept_head');
    expect(migration).not.toContain('pending_bu_head');
  });

  it('preserves locked responses for stages that remain enabled', () => {
    expect(migration).toContain('reviewer_role::text = ANY(v_removed_roles)');
  });
});