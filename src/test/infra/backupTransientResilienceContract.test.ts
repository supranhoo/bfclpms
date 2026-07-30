import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ADR-204 static contract test — backup transient-resilience guard.
//
// Locks the three mitigations added after the 26 Jul (upload Gateway Timeout)
// and 29 Jul (single-table HTTP 502 through all retries) scheduled-backup
// failures, while re-asserting that the Phase-9 invariants they sit on top of
// were not moved.

const RAW = readFileSync(
  resolve(__dirname, '../../../supabase/functions/create-backup/index.ts'),
  'utf8',
);

const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');

describe('create-backup — transient resilience (ADR-204)', () => {
  it('retries part-file uploads idempotently', () => {
    expect(SRC).toContain('async function uploadPartWithRetry(');
    expect(SRC).toMatch(/UPLOAD_RETRY_BACKOFFS_MS\s*=\s*\[/);
    // Retries must overwrite (upsert) so a half-written object cannot
    // permanently poison the retry with "resource already exists".
    expect(SRC).toContain('upsert: attempt > 0');
    // Both stream flush paths must go through the retrying uploader.
    const directUploads = SRC.match(
      /\.from\('database-backups'\)\s*\n?\s*\.upload\(/g,
    ) ?? [];
    // Only the retry helper + the two manifest uploads in finalize.
    expect(directUploads.length).toBeLessThanOrEqual(3);
    expect(SRC).not.toMatch(/upsert: false \}\)\s*\n\s*if \(uploadError\) \{\s*\n\s*throw new Error\(`Upload/);
  });

  it('widens the batch retry schedule but keeps it inside the budget', () => {
    const m = SRC.match(/RETRY_BACKOFFS_MS\s*=\s*\[([^\]]+)\]/);
    expect(m, 'RETRY_BACKOFFS_MS must exist').toBeTruthy();
    const values = m![1]
      .split(',')
      .map((v) => Number(v.replace(/_/g, '').trim()))
      .filter((v) => Number.isFinite(v));
    expect(values.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
    const budgetMs = 8 * 60_000;
    expect(values.reduce((a, b) => a + b, 0)).toBeLessThan(budgetMs);
    expect(SRC).toMatch(/RETRY_BUDGET_MS\s*=\s*8\s*\*\s*60_000/);
  });

  it('runs a coverage reconciliation sweep before finalize', () => {
    const finalizeIdx = SRC.indexOf("finalize: true");
    const reconcileIdx = SRC.indexOf('reconcile:');
    expect(reconcileIdx).toBeGreaterThan(-1);
    expect(reconcileIdx).toBeLessThan(finalizeIdx);
    expect(SRC).toContain('const missing = tablesToBackup.filter(');
    expect(SRC).toContain('budget exhausted');
  });

  it('preserves Phase-9 invariants', () => {
    expect(SRC).toMatch(/BATCH_SIZE\s*=\s*4\b/);
    expect(SRC).toMatch(/BATCH_SIZE_RETRY\s*=\s*1\b/);
    expect(SRC).toMatch(/ROWS_PER_CHUNK\s*=\s*5000\b/);
    expect(SRC).toMatch(/PAGE_SIZE\s*=\s*1000\b/);
    expect(SRC).toContain('loadHardFailOnPartial(');
    expect(SRC).toContain('Coverage shrink:');
  });
});