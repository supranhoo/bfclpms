# Backup Integrity Check at Finalize

## Goal

After all batches upload, verify each expected `<table>.json` file actually
exists in storage and that its row count matches what `processTableBatch`
reported. Fail (or warn) the backup if any file is missing, unreadable, or
has mismatched row counts.

## Where it runs

`supabase/functions/create-backup/index.ts` → `handleFinalize`, immediately
before generating `manifest.json` (so the manifest can record the result).

## Verification logic

For every entry in `tableManifest` (`{ table, rows, file }`):

1. **Existence + size** — `storage.from('database-backups').list(folderPath, { search: '<table>.json' })`
   in batches; confirm the object exists and `metadata.size > 0`.
2. **Row count** — `storage.download(entry.file)`, `JSON.parse`, and assert
   `Array.isArray(data) && data.length === entry.rows`.
3. Process tables **sequentially in small groups (e.g. 4 at a time)** to
   stay under the worker memory limit (same reason batch size was lowered).
4. Collect three buckets of issues:
   - `missing[]` — file not found / zero bytes
   - `unreadable[]` — download or JSON parse failed
   - `row_mismatch[]` — `{ table, expected, actual }`

## Outcome handling

- **All clean** → proceed as today; manifest gains
  `integrity: { status: 'ok', verified_tables: N, verified_at }`.
  `backup_logs.status = 'completed'`.
- **Any issue found** → manifest still uploads with
  `integrity: { status: 'failed', missing, unreadable, row_mismatch, verified_at }`.
  `backup_logs.status = 'completed_with_errors'` and `error_message`
  summarises counts (e.g. `"Integrity: 2 missing, 1 row mismatch"`).
  The function response includes the same `integrity` object so the UI
  can surface it.

## UI surface (minimal)

`src/hooks/useBackups.ts` already toasts `data.errors`. Extend
`useTriggerBackup.onSuccess` to also surface `data.integrity` when present
— a `toast.error` for `failed`, otherwise a quiet success. No new screens.

## Out of scope

- Checksums/hashes (row count + existence is sufficient for now).
- Re-uploading failed tables automatically (operator decides via existing
  Backup Now retry).
- Verifying the storage-manifest bucket inventory.

## Technical notes

- Reuses the existing service-role `supabase` client in `handleFinalize`.
- New `backup_logs.status` value `completed_with_errors` is already a free
  text column — no migration needed.
- Add a new `verifyBackupIntegrity(supabase, folderPath, tableManifest)`
  helper near `processTableBatch` for testability.

## Files touched

- `supabase/functions/create-backup/index.ts` — add helper + wire into
  `handleFinalize`; extend response payload and `backup_logs` update.
- `src/hooks/useBackups.ts` — surface `integrity` in the success toast.
- `docs/safety/phase1/hardening-baseline.md` — note that backup finalize
  now self-verifies (Phase 1.5 closeout).
