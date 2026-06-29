# Fix: Backup Download Truncated to ~60MB vs ~250MB on App

## Root Cause (verified)

This is a real bug, not a display mismatch.

- App shows `backup_logs.file_size_bytes` — the authoritative total written to storage across **all** part files (per ADR-082, large tables are streamed as `<table>.part-000001.json`, `<table>.part-000002.json`, …, 5000 rows per chunk).
- Manifest entries carry both `file` (first part, back-compat) **and** `files: string[]` (full part list) — see `src/hooks/useBackups.ts` lines 132-141.
- `useDownloadBackup` (lines 432-489) iterates `manifest.tables` but reads **only `entry.file`** — the first part. Every additional `.part-NNNNNN.json` chunk is silently dropped.
- Result: for a chunked backup with `notifications` / `org_kpi_data_entry_logs` (10-17 parts each), the merged download contains the first 5000 rows per table only → ~60MB instead of ~250MB.

Severity: this is also a **data-integrity bug**. The downloaded JSON is incomplete and would silently restore a fraction of large tables if re-uploaded via `useUploadAndRestore`. The in-place `restore-backup` edge function already iterates `entry.files` correctly (per ADR-082), so server-side restore is unaffected — only the user-facing download is broken.

## Risk & Impact

- **Data Impact**: Bug currently produces truncated artifacts. Fix restores full content. No DB writes.
- **Workflow Impact**: Download time grows proportionally (60MB → ~250MB) and memory peaks while concatenating in browser. Acceptable on admin-only desktop usage; matches pre-ADR-082 behavior.
- **UI/UX Impact**: None visible beyond longer download + truthful file size. Toast unchanged.
- **Regression Risk**: Low — single function, legacy single-file backups still take the `else` branch unchanged; legacy chunked backups without `files[]` fall back to `[entry.file]`.
- **Scalability**: Browser must hold the merged JSON in memory once. For the largest current backup (~250MB JSON) this is fine on admin desktops but is the practical ceiling. If backups grow past ~500MB we should switch to a streamed ZIP via `fflate` — out of scope here.

## Plan

### Step 1 — Fix the part-file iteration
File: `src/hooks/useBackups.ts`, `useDownloadBackup` (lines 432-489).

- Type `tables` as `Array<{ table: string; rows: number; file: string; files?: string[] }>`.
- For each manifest entry, resolve `parts = entry.files?.length ? entry.files : [entry.file]`.
- Download every part in `parts` and concatenate the parsed arrays into `combinedData[entry.table]` (initialise to `[]`, then `push(...rows)` per part). Preserve existing per-table try/catch so one bad part warns and continues, matching current resilience.
- Keep the legacy `else` branch (non-manifest path) unchanged for pre-ADR-082 single-file backups.

**Verification**: `combinedData[table].length` for each table must equal the manifest `entry.rows`. Add a `console.warn` when the count mismatches so QA can spot silent part-fetch failures.

### Step 2 — Tests
File: `src/test/backupDownloadChunkedParts.test.ts` (new).

- Mock `supabase.storage.from('database-backups').download` to return: a manifest with one table carrying `files: ['…/t.part-000001.json', '…/t.part-000002.json']` (5000 + 3000 rows), and the two part blobs.
- Assert the produced merged JSON has `data.<table>.length === 8000` and that `download` was called for every part (including the manifest).
- Add a back-compat case: manifest entry with only `file` (no `files`) → falls back to single-part download.

### Step 3 — Documentation & Policy
- `DOCUMENTATION.md`: log release `v2.66.70` — "Fix: chunked backup download was fetching only the first part per table; downloads are now complete."
- `POLICY.md` §BACKUP-DOWNLOAD-COMPLETENESS: "Any client-side merge of a chunked backup manifest MUST iterate `entry.files` (fallback `[entry.file]`). Downloaded JSON row count per table MUST equal `entry.rows`."
- `docs/adr/ADR-101.md`: short ADR linking back to ADR-082; documents the missed mirror-update on the download path.
- `mem/infrastructure/database/streaming-chunked-backup`: append note that the download merger must mirror `restore-backup`'s `entry.files` iteration.

### Step 4 — Rollback
Single-file revert of `useBackups.ts` `useDownloadBackup` plus the new test. No schema, no edge function, no storage changes.

## Out of Scope (flagged, not done now)

- Streamed ZIP download for >500MB backups (would replace JSON.stringify concatenation).
- Re-verifying old already-downloaded "60MB" artifacts — those are permanently truncated; admins should re-download after the fix lands.
- Any change to `create-backup` / `restore-backup` edge functions — they are correct per ADR-082.
