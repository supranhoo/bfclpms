## 1. Assumptions
- “Still not fixed” refers to the attached Backup History screen showing scheduled backups failing with `Coverage shrink: 201/203 tables backed up` and `HTTP 546`.
- The current hard-fail behavior is correct: partial backups must remain `failed`, not hidden as warnings.
- No production data should be deleted or excluded to make backups pass.

## 2. Clarifications
Not Applicable — the failure signature is visible in live backup logs and the screenshot.

## 3. Risk & Impact Report
- **Data Impact:** No table data will be modified. Backup artifact format will change only if we introduce chunked per-table files; restore must be updated in the same change.
- **Workflow Impact:** Scheduled backups should move from repeated `failed` to complete coverage. Manual backup path should remain compatible.
- **UI/UX Impact:** Backup History may show clearer table-level failure detail, but no major UI redesign.
- **Regression Risk:** Medium-high because backup and restore are disaster-recovery flows. Mitigation: contract tests for backup format, restore compatibility, and hard-fail behavior.
- **Scalability Impact:** Current code buffers large tables in memory. The fix must page large tables and upload per-table chunks so memory is bounded by page size, not table size.
- **Rollback:** Revert edge-function changes and docs/tests. Existing backups remain readable if restore keeps legacy manifest support.

## 4. RCA
### What is happening
Recent scheduled backups consistently fail:
- `2026-06-06` through `2026-06-09`: `201/203 tables backed up`
- Repeated error: `Batch 46/51 transient: HTTP 546`
- Retry sub-batch 1 fails even after retries; sub-batch 2 recovers.

### Where it fails
Based on current backup ordering, batch 46 maps to the high-volume tables around:
- `notifications` — ~78k rows, ~67 MB relation size
- `org_kpi_data_entry_logs` — ~85k rows, ~57 MB relation size
- nearby tables include `org_kpi_value_history`, `pip_audit_logs`

`notifications` and `org_kpi_data_entry_logs` are the two largest tables in the database. They are processed together in retry sub-batch 1, which explains why the same sub-batch fails repeatedly.

### Root cause
`create-backup` still uses a whole-table memory pattern:
1. `fetchAllRows()` loads all rows for a table into `allRows`.
2. `processTableBatch()` calls `JSON.stringify(rows)` for the whole table.
3. It then measures/uploads the full JSON payload.

Even after reducing `BATCH_SIZE` and making table processing sequential inside a batch, a single large table can still exceed the edge worker memory cap. When two large tables are in a retry sub-batch, failure becomes deterministic.

### Important secondary finding
The `201/203` wording is not itself a table-discovery exclusion. Current live `public` base table count is 204 with 1 denylisted table, so expected backup coverage is 203. The backup discovers 203 but only successfully uploads 201. The two missing tables are caused by failed processing, not by `backup_denylist`.

## 5. Why-Why Analysis
1. **Why are scheduled backups failing?**
   Because a scheduled backup completes only 201 of 203 expected tables.
2. **Why are two tables missing?**
   Because batch 46 hits `HTTP 546`, and one retry sub-batch still fails after retries.
3. **Why does batch 46 hit `HTTP 546`?**
   Because it contains the largest high-volume tables (`notifications`, `org_kpi_data_entry_logs`) and exceeds the edge worker memory limit.
4. **Why does memory exceed the limit?**
   Because the implementation accumulates entire table rows and full JSON strings in memory before upload.
5. **Why did previous CAPA not fix it?**
   Previous fixes reduced batch size, added retry/backoff, and hard-failed partial backups. Those addressed concurrency, transient rate limits, and visibility — but not the core per-table memory architecture.

## 6. CAPA Plan
### Corrective actions
1. **Refactor backup table processing to bounded chunks**
   - Replace whole-table `fetchAllRows()` for scheduled/manual backup with page-by-page table export.
   - Upload large tables as chunk files such as:
     - `chunked/<timestamp>/<table>/part-000001.json`
     - `chunked/<timestamp>/<table>/part-000002.json`
   - Keep an aggregate manifest entry per table with total row count, total bytes, and chunk file list.

2. **Maintain legacy compatibility**
   - `restore-backup` must support both:
     - existing legacy file: `<table>.json`
     - new chunked files: `<table>/part-*.json`
   - Existing backups must remain restorable.

3. **Separate heavy-table retry granularity**
   - For retry, split failed batches down to single-table retries if the first retry still fails.
   - This prevents `notifications` and `org_kpi_data_entry_logs` from being retried together.

4. **Improve error telemetry**
   - Record exact failed table names in `backup_logs.error_message` when a sub-batch fails.
   - Avoid only saying `Batch 46/51`.

### Preventive actions
5. **Add contract tests**
   - Assert `create-backup` no longer has the whole-table `allRows.concat(...)` + full-table JSON export pattern for backup processing.
   - Assert chunked table manifest support exists.
   - Assert `restore-backup` supports chunked table files and legacy files.
   - Assert hard-fail-on-partial still remains active.

6. **Update documentation and policy**
   - Update Phase 9 docs with this RCA and the new bounded-memory backup design.
   - Update backup policy/memory to state: large tables must be exported page-by-page; no full-table buffering.

## 7. UI Changes
- **Location:** `/admin/settings` → Backup & Restore → Backup History.
- **Visual change:** Keep the existing table. Improve failed-row action/detail text only if needed.
- **Interaction impact:** Admins continue to see failed backups as red. Completed backups still allow download/restore/drill where eligible.
- **Responsiveness:** No layout change required.

## 8. Implementation
After approval, implement in this order:
1. Inspect `restore-backup` manifest loading path.
2. Update `create-backup` table export to use bounded page chunks.
3. Update `restore-backup` to restore both chunked and legacy table payloads.
4. Add single-table fallback retry for scheduled backups.
5. Add table-name telemetry to backup error summaries.
6. Update docs/memory/ADR.

## 9. Tests
- Add/update backup contract tests under `src/test/safety/phase9/`.
- Add edge-function unit tests for:
  - chunked table manifest creation
  - legacy restore compatibility
  - chunked restore compatibility
  - single-table retry fallback
  - hard-fail partial status remains `failed`

## 10. DOCUMENTATION.md updates
- If `DOCUMENTATION.md` exists, update the backup architecture section.
- If it does not exist, document in the existing Phase 9 backup docs and ADR instead.

## 11. POLICY.md updates
- If `POLICY.md` exists, update backup policy to prohibit whole-table buffering for backup exports.
- If it does not exist, update the existing backup policy memory/docs instead.

## 12. Post-implementation notes
- A clean scheduled backup after deployment is the final proof.
- Do not flip `backup_hard_fail_on_partial` to `false`; it is correctly exposing partial backups.
- Do not add large operational tables to `backup_denylist` as a workaround.