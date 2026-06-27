# Backup Retention Policy

Today: 53 backups (33 failed, 7 partial, 13 completed) ≈ 8 GB. Each snapshot is full, not incremental, so storage grows linearly. Goal: admin-configurable auto-prune.

## Risk & Impact

- **Data**: Deletion is irreversible. Mitigated by (a) "always keep last N completed" floor, (b) dry-run mode that logs intended deletions without removing files, (c) admin-only RLS, (d) every prune run recorded in `backup_logs` as `backup_type = 'retention_sweep'`.
- **Workflow**: No change to existing create/restore flows. Adds an opt-in policy + daily cron.
- **UI**: New "Retention Policy" card in Admin → Backups, below the existing Schedule card.
- **Regression**: None — new function, additive schema, separate cron job.
- **Scalability**: Sweep is O(eligible rows) and paginated; deletes storage in chunks of 100.

## Policy (stored in `system_settings`, key `backup_retention_policy`)

```json
{
  "enabled": false,
  "keep_completed_days": 30,
  "keep_completed_min_count": 10,
  "keep_partial_days": 14,
  "keep_failed_days": 7,
  "dry_run": false
}
```

Rules:
- A `completed` row is eligible if `created_at` older than `keep_completed_days` AND there are at least `keep_completed_min_count` newer completed rows. The floor wins over the age cutoff — we never go below the floor.
- A `completed_with_errors` (partial) row is eligible if older than `keep_partial_days`.
- A `failed` row is eligible if older than `keep_failed_days`.
- `running` rows are never touched (the reaper owns those).
- `dry_run = true` → log candidates, delete nothing.

## Steps

1. **Migration**: insert default `backup_retention_policy` row into `system_settings` (disabled by default — explicit admin opt-in).
2. **Edge function** `supabase/functions/backup-retention-sweep/index.ts`:
   - Auth: `X-Cron-Secret` OR service-role bearer OR admin JWT (same pattern as `reap-stuck-backups` + admin path for the manual "Run Now" button).
   - Read policy; if `enabled=false`, exit with `{ skipped: true }`.
   - Select candidates per the rules above.
   - For each candidate, list `database-backups/{folder_path}` (paginated) and `storage.remove` in chunks of 100; then delete the `backup_logs` row.
   - Write a summary row to `backup_logs` with `backup_type='retention_sweep'`, `status='completed'` (or `completed_with_errors`), and details in `error_message` JSON when applicable.
3. **Cron**: daily at 03:30 via `pg_cron` + `pg_net` (separate `supabase--insert` call so the URL/anon key are not in a migration).
4. **Hook + UI**: `useBackupRetentionPolicy` / `useUpdateBackupRetentionPolicy` / `useRunRetentionSweepNow`; new `RetentionPolicyCard` mounted in `BackupRestoreTab` below the Schedule card. Fields: enabled switch, three numeric inputs, min-keep input, dry-run switch, "Save", "Run Now" (confirm dialog).
5. **Tests**:
   - `src/test/infra/backupRetentionSelection.test.ts` — pure selector covering age cutoff, min-count floor, partial/failed buckets, dry-run.
   - `supabase/functions/backup-retention-sweep/auth_test.ts` — rejects unauthenticated calls.
6. **Docs**: `DOCUMENTATION.md` WP-9.4 (retention) + `POLICY.md` retention defaults + memory file `mem/infrastructure/database/backup-retention-policy`.

## UI Changes

Location: `/admin/settings?section=backups`, new card under "Scheduled Backup".

```text
┌─ Retention Policy ─────────────────────────────┐
│ [Switch] Enable automatic pruning              │
│                                                │
│ Keep completed backups for [30] days           │
│ Always keep at least  [10] completed backups   │
│ Keep partial backups   for [14] days           │
│ Keep failed backups    for  [7] days           │
│                                                │
│ [Switch] Dry run (log candidates, don't delete)│
│                                                │
│ [Save]   [Run Now]  Last sweep: 2026-06-27 …   │
└────────────────────────────────────────────────┘
```

Interaction: "Run Now" opens a `ConfirmDestructiveDialog` summarizing how many backups would be deleted (preview via dry-run preflight) before executing.

## Files

- Created: `supabase/functions/backup-retention-sweep/index.ts`, `supabase/functions/backup-retention-sweep/auth_test.ts`, `src/test/infra/backupRetentionSelection.test.ts`, `mem/infrastructure/database/backup-retention-policy`, `src/lib/backup/retentionSelection.ts` (shared selector — imported by edge fn via inline copy and by the unit test).
- Edited: `src/hooks/useBackups.ts` (3 new hooks), `src/components/admin/BackupRestoreTab.tsx` (new card), `DOCUMENTATION.md`, `POLICY.md`, `mem/index.md`.
- Migration: 1 (seed default policy row).
- Insert call: 1 (`cron.schedule` for daily sweep).

## Rollback

Disabling the policy switch stops all pruning immediately. The cron job can be removed with `cron.unschedule('backup-retention-sweep-daily')`. Schema change is additive and reversible.
