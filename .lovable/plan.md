

# Fix Manual Backup: Memory Limit Exceeded

## Root Cause

The `create-backup` Edge Function loads ALL table data (~48K rows, ~45MB JSON) into memory simultaneously before uploading to storage. This exceeds the Edge Function memory limit (~150MB), causing it to crash with "Memory limit exceeded".

**Scheduled backups work** because they're invoked via `pg_cron` + `net.http_post` which runs in a different execution context with more memory headroom. Manual backups (invoked via `supabase.functions.invoke`) hit the stricter Edge Function memory limit.

## Evidence

- `backup_logs` shows a manual backup from today stuck in "running" status (never completed)
- Edge function logs show: `ERROR: Memory limit exceeded` when invoked manually
- Data size: ~48K rows across 40 tables, producing ~45MB JSON
- Biggest tables: `notifications` (26K), `email_logs` (7K), `kpi_audit_logs` (7K)

## Solution: Chunked Upload with Streaming

Instead of building the entire backup JSON in memory, process tables one at a time and upload each as a separate file, then create a manifest file that ties them together. This keeps peak memory usage under control.

### Architecture Change

```text
BEFORE (single file):
  backup-2026-02-27.json  (45MB in memory at once)

AFTER (chunked files):
  backups/backup-2026-02-27/manifest.json     (~1KB)
  backups/backup-2026-02-27/notifications.json (~15MB, streamed)
  backups/backup-2026-02-27/email_logs.json    (~5MB, streamed)
  backups/backup-2026-02-27/kpis.json          (~3MB, streamed)
  ... (one file per table)
```

Each table is fetched, serialized, uploaded to storage, and then **released from memory** before moving to the next table. Peak memory usage drops from ~45MB to ~15MB (the largest single table).

### Changes

#### 1. Update `supabase/functions/create-backup/index.ts`

- Process tables sequentially: fetch -> serialize -> upload -> release memory
- Upload each table as a separate JSON file under a timestamped folder
- Create a `manifest.json` with metadata (table list, row counts, timestamps)
- Keep backward compatibility: the `file_path` in `backup_logs` points to the manifest
- Add a `backup_format` field to distinguish old single-file backups from new chunked ones

#### 2. Update `supabase/functions/restore-backup/index.ts`

- Detect backup format: if `file_path` ends with `manifest.json`, use chunked restore
- For chunked backups: read manifest, then download and restore each table file individually
- For legacy single-file backups: keep existing behavior unchanged

#### 3. Update `src/hooks/useBackups.ts` (useDownloadBackup)

- For chunked backups: download the manifest, then download all table files, combine into a single JSON for the user's download
- Alternatively, download the manifest and show individual table files (simpler)

#### 4. Clean up stuck backup

- The stuck "running" backup log entry from today will be cleaned up by adding a check at the start of the function: if a backup has been "running" for more than 30 minutes, mark it as "failed" with a timeout message

### Database Migration

Add `backup_format` column to `backup_logs`:

```sql
ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS backup_format text NOT NULL DEFAULT 'single';
```

Values: `'single'` (legacy) or `'chunked'` (new format).

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| DB migration | Create | Add `backup_format` column to `backup_logs` |
| `supabase/functions/create-backup/index.ts` | Rewrite | Chunked per-table upload to stay under memory limit |
| `supabase/functions/restore-backup/index.ts` | Update | Support both single-file and chunked restore |
| `src/hooks/useBackups.ts` | Update | Handle chunked download format |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | None | Existing backups remain downloadable/restorable (legacy format supported) |
| Regression | Low | Restore function handles both formats; old backups still work |
| Memory | Fixed | Peak usage drops from ~45MB to ~15MB (largest single table) |
| Scheduled backups | None | Same function, just more efficient now |

