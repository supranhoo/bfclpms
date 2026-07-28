/**
 * ADR-196 / POLICY §WF-STAGE-COLUMN-COMPLETENESS
 *
 * Every reviewer stage that the client can write MUST have the full column
 * set on `public.review_submissions`. The Functional Manager stage shipped
 * with only 4 of 6 columns, producing the runtime failure:
 *   "Could not find the 'functional_manager_achieved_value' column of
 *    'review_submissions' in the schema cache".
 *
 * Guards: (1) generated Supabase types expose every column for every stage,
 *         (2) bulk_write_stage_scores persists the FM achieved value.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const types = readFileSync(join(root, 'src/integrations/supabase/types.ts'), 'utf8');

const STAGE_PREFIXES = [
  'manager',
  'functional_manager',
  'skip_level',
  'hr_pms',
  'auditor',
  'management',
] as const;

const SUFFIXES = [
  'score',
  'rating',
  'remarks',
  'achieved_value',
  'evidence_url',
  'evidence_urls',
] as const;

/** Row shape of `review_submissions` inside the generated types file. */
function reviewSubmissionsRow(): string {
  const anchor = types.indexOf('review_submissions: {');
  expect(anchor).toBeGreaterThan(-1);
  const rowStart = types.indexOf('Row: {', anchor);
  const rowEnd = types.indexOf('\n        }', rowStart);
  return types.slice(rowStart, rowEnd);
}

describe('review_submissions stage column completeness', () => {
  const row = reviewSubmissionsRow();

  it.each(
    STAGE_PREFIXES.flatMap((p) => SUFFIXES.map((s) => [`${p}_${s}`] as const)),
  )('exposes %s', (col) => {
    expect(row).toMatch(new RegExp(`\\n\\s+${col}\\??:`));
  });

  it('keeps evidence_urls nullable for every stage (peer parity)', () => {
    for (const p of STAGE_PREFIXES) {
      expect(row).toMatch(new RegExp(`${p}_evidence_urls\\??: [^\\n]*\\| null`));
    }
  });
});

describe('bulk_write_stage_scores — Functional Manager achieved value', () => {
  const migrations = readdirSync(join(root, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const combined = migrations
    .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8'))
    .join('\n');

  it('mirrors the achieved value into functional_manager_achieved_value', () => {
    expect(combined).toContain('functional_manager_achieved_value = v_mirror_achieved');
  });

  it('clears functional_manager_achieved_value on an N/A write', () => {
    expect(combined).toContain('functional_manager_achieved_value = NULL');
  });
});