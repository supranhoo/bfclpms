/** Regression guard for ADR-226 queue schema drift. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationDir = join(process.cwd(), 'supabase', 'migrations');

function latestQueueMigration(): string {
  const files = readdirSync(migrationDir).filter((file) => file.endsWith('.sql')).sort().reverse();
  const file = files.find((candidate) =>
    readFileSync(join(migrationDir, candidate), 'utf8').includes('FUNCTION public.ar_recommendation_queue('));
  if (!file) throw new Error('No migration defines ar_recommendation_queue');
  return readFileSync(join(migrationDir, file), 'utf8');
}

describe('ADR-226 recommendation queue schema contract', () => {
  const sql = latestQueueMigration();

  it('uses the current profile designation field', () => {
    expect(sql).toMatch(/p\.designation::text\s+AS\s+desig_name/i);
    expect(sql).not.toMatch(/p\.designation_id\b/i);
  });

  it('keeps pagination and authenticated-only execution', () => {
    expect(sql).toMatch(/LIMIT\s+GREATEST/i);
    expect(sql).toMatch(/OFFSET\s+GREATEST/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*TO authenticated/i);
  });
});