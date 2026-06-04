/**
 * Phase 9.1 SSOT — Backup coverage contract (static source scan).
 *
 * Locks the invariants that keep Safety (and every other `public` table)
 * in the backup envelope:
 *
 *   I1. `create-backup` discovers tables via the
 *       `get_backup_table_order` RPC — no hardcoded safety allowlist.
 *   I2. `restore-backup` consults the same RPC (legacy order is a
 *       fallback only).
 *   I3. `STORAGE_BUCKETS` includes `safety-media`, `review-evidence`,
 *       `avatars`.
 *   I4. `BATCH_SIZE = 4` is present in BOTH manual (`handleInit`) and
 *       scheduled (`runScheduledChunked`) paths — locked by Phase 8
 *       OOM-fix memory `mem/infrastructure/database/scheduled-backup-batch-size`.
 *   I5. No hardcoded `safety_<word>` string literal in the runtime path
 *       of `create-backup` (the legacy fallback list in `restore-backup`
 *       is intentional and excluded from this check).
 *
 * Read-only. Pure source scan. No DB or runtime call.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CREATE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/create-backup/index.ts'),
  'utf8',
);
const RESTORE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/restore-backup/index.ts'),
  'utf8',
);

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const MIGRATION_SRCS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
  .join('\n');

describe('Phase 9.1 — Backup coverage contract', () => {
  it('I1 — create-backup discovers tables via the get_backup_table_order RPC', () => {
    expect(CREATE_SRC).toMatch(/supabase\.rpc\(\s*['"]get_backup_table_order['"]\s*\)/);
  });

  it('I2 — restore-backup also calls the get_backup_table_order RPC', () => {
    expect(RESTORE_SRC).toMatch(/supabase\.rpc\(\s*['"]get_backup_table_order['"]\s*\)/);
  });

  it('I3 — STORAGE_BUCKETS includes safety-media, review-evidence, avatars', () => {
    const match = CREATE_SRC.match(/STORAGE_BUCKETS\s*=\s*\[([^\]]+)\]/);
    expect(match, 'STORAGE_BUCKETS constant must exist in create-backup').not.toBeNull();
    const body = match![1];
    for (const bucket of ['safety-media', 'review-evidence', 'avatars']) {
      expect(body).toContain(`'${bucket}'`);
    }
  });

  it('I4 — BATCH_SIZE = 4 is present in both manual and scheduled paths', () => {
    const occurrences = CREATE_SRC.match(/const\s+BATCH_SIZE\s*=\s*4\b/g) ?? [];
    expect(
      occurrences.length,
      'BATCH_SIZE=4 must appear in BOTH handleInit and runScheduledChunked (256MB OOM guard)',
    ).toBeGreaterThanOrEqual(2);
  });

  it('I5 — create-backup has no hardcoded safety_* table allowlist', () => {
    const lines = CREATE_SRC.split('\n');
    const offenders: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      // PRUNE_TABLES legitimately names `safety_notifications` for the
      // 90-day retention sweep; that is not a coverage allowlist.
      if (/safety_notifications\s*:/.test(line)) continue;
      if (/['"`]safety_[a-z_]+['"`]/.test(line)) offenders.push(line);
    }
    expect(
      offenders,
      `create-backup must not hardcode safety_* table literals (coverage is RPC-driven):\n${offenders.join('\n')}`,
    ).toHaveLength(0);
  });

  it('I6 — backup_hard_fail_on_partial system setting is seeded with default true', () => {
    // A migration must insert the setting key with value true (jsonb).
    expect(MIGRATION_SRCS).toMatch(/backup_hard_fail_on_partial/);
    // Locate the INSERT statement that introduces the row and assert the value.
    const insertBlock = MIGRATION_SRCS.match(
      /INSERT INTO public\.system_settings[^;]*backup_hard_fail_on_partial[^;]*;/i,
    );
    expect(
      insertBlock,
      'A migration must INSERT backup_hard_fail_on_partial into system_settings',
    ).not.toBeNull();
    expect(insertBlock![0]).toMatch(/'true'::jsonb/);
  });

  it('I7 — create-backup hard-fails partial runs when the flag is true', () => {
    // Flag loader must exist and default to true on missing/error (fail closed).
    expect(CREATE_SRC).toMatch(/loadHardFailOnPartial/);
    expect(CREATE_SRC).toMatch(/backup_hard_fail_on_partial/);
    // Scheduled path: partial run with hardFail must land as 'failed'
    // (not 'completed_with_errors').
    expect(CREATE_SRC).toMatch(/hardFail\s*&&\s*shrunk\s*\?\s*['"]failed['"]/);
    // Manual finalize must consult the flag too.
    expect(CREATE_SRC).toMatch(/hardFailManual\s*&&\s*partialManual/);
  });

  // ─── Phase 9.2 WP-b — Backup batch retry/backoff hardening ──────────────

  it('I8 — retry constants are declared and primary BATCH_SIZE=4 unchanged', () => {
    expect(CREATE_SRC).toMatch(/const\s+BATCH_SIZE_RETRY\s*=\s*2\b/);
    expect(CREATE_SRC).toMatch(/const\s+RETRY_BUDGET_MS\s*=/);
    // I4 must remain green: BATCH_SIZE=4 still appears in BOTH paths.
    const occurrences = CREATE_SRC.match(/const\s+BATCH_SIZE\s*=\s*4\b/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('I9 — isTransientChunkError gates retry on 546 / 429 / RateLimit only', () => {
    expect(CREATE_SRC).toMatch(/isTransientChunkError/);
    // Positive classifiers must all appear.
    expect(CREATE_SRC).toMatch(/HTTP\\s\+546/);
    expect(CREATE_SRC).toMatch(/HTTP\\s\+429/);
    expect(CREATE_SRC).toMatch(/RateLimitError\|Rate limit/);
    // The retry call site must guard on the classifier.
    expect(CREATE_SRC).toMatch(/isTransientChunkError\(\s*result\.error/);
  });

  it('I10 — hard-fail terminal remains the authority after retries', () => {
    // The retry helper must not bypass the WP-9.2.a hard-fail predicate.
    expect(CREATE_SRC).toMatch(/hardFail\s*&&\s*shrunk\s*\?\s*['"]failed['"]/);
    // Budget-exhausted / non-transient branches must record the chunk as
    // failed so the post-loop coverage check fires.
    expect(CREATE_SRC).toMatch(/budget exhausted/);
    expect(CREATE_SRC).toMatch(/non-transient/);
  });

  it('I11 — manual finalize semantics preserved (no retry wiring on manual path)', () => {
    // The shared classifier must NOT be called from finalizeManualBackup.
    const manualMatch = CREATE_SRC.match(
      /async\s+function\s+finalizeManualBackup[\s\S]*?\n\}\n/,
    );
    expect(manualMatch, 'finalizeManualBackup function must exist').not.toBeNull();
    expect(manualMatch![0]).not.toMatch(/isTransientChunkError/);
    expect(manualMatch![0]).not.toMatch(/retryFailedBatchTransient/);
    // WP-9.2.a manual hard-fail branch still present.
    expect(manualMatch![0]).toMatch(/hardFailManual\s*&&\s*partialManual/);
  });
});
