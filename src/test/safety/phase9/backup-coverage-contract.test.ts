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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CREATE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/create-backup/index.ts'),
  'utf8',
);
const RESTORE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/restore-backup/index.ts'),
  'utf8',
);

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
});
