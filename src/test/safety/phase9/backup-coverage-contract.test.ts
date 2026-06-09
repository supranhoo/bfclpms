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
const DRILL_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/safety-drill/index.ts'),
  'utf8',
);
const DRILL_HOOK_SRC = readFileSync(
  join(process.cwd(), 'src/hooks/useSafetyDrill.ts'),
  'utf8',
);
const BACKUP_TAB_SRC = readFileSync(
  join(process.cwd(), 'src/components/admin/BackupRestoreTab.tsx'),
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
    // ADR-082: retry was tightened from 2 → 1. Single-table retry isolates
    // a failing table from a healthy sibling.
    expect(CREATE_SRC).toMatch(/const\s+BATCH_SIZE_RETRY\s*=\s*1\b/);
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
    // Manual finalize lives in handleFinalize. The shared classifier and
    // retry helper must NOT be wired into it in this WP.
    const manualMatch = CREATE_SRC.match(
      /async\s+function\s+handleFinalize\([\s\S]*?\n\}\n/,
    );
    expect(manualMatch, 'handleFinalize function must exist').not.toBeNull();
    expect(manualMatch![0]).not.toMatch(/isTransientChunkError/);
    expect(manualMatch![0]).not.toMatch(/retryFailedBatchTransient/);
    // WP-9.2.a manual hard-fail branch still present in the same function.
    expect(manualMatch![0]).toMatch(/hardFailManual\s*&&\s*partialManual/);
  });

  // ─── Phase 9.3 WP-9.3 — Safety backup→restore drill (Flow B UI) ─────────

  it('I12 — safety-drill writes are isolated to safety_drill.* (no mutation of public Safety tables)', () => {
    // Production Safety tables may only appear in read paths inside the
    // drill function. The function itself must never call .insert/.update/
    // .delete/.upsert against public safety tables — all sandbox writes go
    // through the safety_drill_* RPCs.
    const forbidden = [
      /\.from\(\s*['"]safety_incidents['"]\s*\)\s*\.(insert|update|delete|upsert)/,
      /\.from\(\s*['"]safety_permits['"]\s*\)\s*\.(insert|update|delete|upsert)/,
      /\.from\(\s*['"]safety_audit_runs['"]\s*\)\s*\.(insert|update|delete|upsert)/,
    ];
    for (const re of forbidden) {
      expect(DRILL_SRC, `safety-drill must not mutate live Safety tables: ${re}`).not.toMatch(re);
    }
    // Sandbox RPCs must be the write path.
    expect(DRILL_SRC).toMatch(/safety_drill_seed/);
    expect(DRILL_SRC).toMatch(/safety_drill_truncate/);
    expect(DRILL_SRC).toMatch(/safety_drill_load/);
  });

  it('I13 — useSafetyDrill invokes the safety-drill function (not a path) and forwards backup_id', () => {
    expect(DRILL_HOOK_SRC).toMatch(/supabase\.functions\.invoke\(\s*['"]safety-drill['"]/);
    expect(DRILL_HOOK_SRC).toMatch(/backup_id/);
  });

  it('I14 — BackupRestoreTab gates the drill action: not on failed rows, only on completed/completed_with_errors', () => {
    // The action must be wired via useSafetyDrill and only render inside
    // the completed / completed_with_errors branch (same branch as
    // Download/Restore). It must NOT appear under a `status === 'failed'`
    // condition.
    expect(BACKUP_TAB_SRC).toMatch(/useSafetyDrill/);
    expect(BACKUP_TAB_SRC).toMatch(
      /verifyDrill\.mutate\(\s*\{\s*backupId:\s*backup\.id\s*\}\s*\)/,
    );
    // Hard guard: the drill mutate call must not be guarded by a 'failed' status branch.
    const failedDrillBranch =
      /backup\.status\s*===\s*['"]failed['"][\s\S]{0,500}?verifyDrill\.mutate/;
    expect(BACKUP_TAB_SRC).not.toMatch(failedDrillBranch);
  });

  it('I15 — Phase 9.2 composition guard: hard-fail predicates + retry constants still present', () => {
    // Phase 9.3 must not touch create-backup; the WP-9.2.a/b invariants
    // are re-asserted here as a composition guard so a Phase 9.3 edit
    // cannot silently weaken them.
    expect(CREATE_SRC).toMatch(/hardFail\s*&&\s*shrunk\s*\?\s*['"]failed['"]/);
    expect(CREATE_SRC).toMatch(/hardFailManual\s*&&\s*partialManual/);
    expect(CREATE_SRC).toMatch(/const\s+BATCH_SIZE_RETRY\s*=\s*1\b/);
    expect(CREATE_SRC).toMatch(/const\s+RETRY_BUDGET_MS\s*=/);
  });

  // ─── ADR-082 — Streaming chunked table export ──────────────────────────

  it('I16 — create-backup streams tables to part files (no whole-table buffering)', () => {
    // The streaming helper and per-chunk row budget must exist.
    expect(CREATE_SRC).toMatch(/streamTableToStorage/);
    expect(CREATE_SRC).toMatch(/const\s+ROWS_PER_CHUNK\s*=/);
    expect(CREATE_SRC).toMatch(/partFileName/);
    // The old whole-table accumulator pattern must be gone.
    expect(CREATE_SRC).not.toMatch(/allRows\s*=\s*allRows\.concat\(/);
    // processTableBatch returns a `files` array per result.
    expect(CREATE_SRC).toMatch(/files:\s*string\[\]/);
  });

  it('I17 — restore-backup honours the part-files manifest array', () => {
    // The manifest type accepts `files?: string[]`, and insert iterates
    // them instead of downloading a single file per table.
    expect(RESTORE_SRC).toMatch(/files\?\s*:\s*string\[\]/);
    expect(RESTORE_SRC).toMatch(/entry\.files\s*&&\s*entry\.files\.length\s*>\s*0/);
  });
});
