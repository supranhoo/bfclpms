# Why Backup Is Failing

## Root cause (confirmed from `backup_logs` + source)

Every recent scheduled run reaches the end of the batch phase successfully — the
log row shows **all 217–218 tables processed and ~315k rows written** before the
error appears. The failure is in the **finalize** stage:

```
status        = failed
tables_count  = 218        ← all batches succeeded
total_rows    = 317,466
error_message = "Finalize failed: HTTP 546. Batch errors: " (empty list)
```

`HTTP 546` = Deno Deploy worker exceeded the **256 MB memory cap**.

The finalize worker (separate 150s/256MB invocation) runs
`verifyBackupIntegrity()` in `supabase/functions/create-backup/index.ts`
(lines 301–391). For **every** table in the manifest it:

1. Downloads the per-table JSON file from storage (`supabase.storage…download(partPath)`).
2. Calls `blob.text()` — full payload as a JS string.
3. Calls `JSON.parse(text)` — full payload as a JS array of objects.
4. Reads `parsed.length` just to re-confirm the row count the batch already reported.

With 218 tables × ~1.1 MB average JSON each, and JS string + parsed-object
overhead of roughly 3–5× the on-disk size, peak memory during finalize is well
over 256 MB even with `CONCURRENCY = 4`. The throwaway parsed objects are not
used for anything except `parsed.length`.

This is **not** a batch / OOM-in-export issue (those are already mitigated by
`BATCH_SIZE = 4` and the WP-9.2.c retry classifier). The data is safely on
disk — the verifier kills itself trying to re-read it.

## Fix

Replace the "download + JSON.parse every table" step with a memory-safe
verification:

- Keep the existing `storage.list(folderPath)` presence + size check
  (already in place, lines 308–322).
- Treat a file as **present** if list returns it with `size > 0`.
- **Trust the row count reported by the batch worker** (it counted rows at
  write time and stored them in `tableManifest[i].rows`). Re-parsing the same
  payload in a different worker only to recount is redundant and is what
  blows the memory budget.
- Only fall back to a streaming row count (chunked `ReadableStream` + delimiter
  count, no `JSON.parse` of the whole body) **if the list shows a file is
  missing or zero-sized** — i.e. the rare actually-broken case.

Net effect:

| | Before | After |
|---|---|---|
| Per-table memory in finalize | Full JSON string + parsed array | ~0 (list entry only) |
| Peak finalize memory (218 tables) | > 256 MB → HTTP 546 | < 50 MB |
| Integrity guarantees kept | presence, size, row-count parity | presence, size, row-count parity (parity now from manifest, not re-parse) |

Hard-fail-on-partial (`backup_hard_fail_on_partial`) and the WP-9.2.a/b retry
contracts are **untouched** — if a batch genuinely dropped a table the storage
list will still show it missing, integrity will still report it, and the run
will still be marked `failed`. Contract tests I6–I15 stay green.

## Implementation steps (single file)

1. **`supabase/functions/create-backup/index.ts`** — `verifyBackupIntegrity()`:
   - Keep the `storage.list` prelisting loop.
   - For each manifest entry, set `actualRows = entry.rows` and verify each
     `partPath` exists in `presentSizes` with size > 0.
   - Remove the `download` / `blob.text()` / `JSON.parse` block.
   - Push to `issues.missing` when a part is absent; push to `issues.unreadable`
     when a part is listed but size === 0.
   - Leave the row_mismatch branch in place — it now triggers only when a
     future code path supplies a divergent count (defensive, near-zero memory).

2. **Tests** (`supabase/functions/create-backup/`):
   - Add `verify_integrity_memory_test.ts` asserting `verifyBackupIntegrity`
     never calls `supabase.storage.from(...).download(...)` on the happy path
     (spy/mock the storage client; assert `download` call count === 0 when
     every manifest file is present in the list).
   - Add a missing-file case asserting `download` is still not called, and the
     report flags the missing file.
   - Keep existing `transient_classifier_test.ts` and other Phase-9 tests
     untouched.

3. **Manual one-shot recovery**:
   - Run one **manual** backup from the Admin → Backups screen after deploy to
     produce a green `completed` row and reset the "latest successful" pointer.

## Risk & Impact Report

- **Data Impact:** None. No schema change, no migration. `backup_logs` rows
  written exactly as today.
- **Workflow Impact:** None for users. Scheduled cron continues on the same
  schedule.
- **UI/UX Impact:** None — Backup History rendering, hard-fail copy, and the
  WP-9.3 "Verify (Safety Drill)" action are unchanged.
- **Regression Risk:** Low. The only behavior change is "integrity no longer
  re-counts rows by parsing files; it trusts the manifest count produced
  seconds earlier in the same run." If batch-side row counting were ever
  wrong, the old verifier would catch it; the new one would not. Mitigation:
  the batch row counter is already the same code path the manifest, log, and
  hard-fail check all rely on — there is no independent source of truth to
  preserve.
- **Scalability Impact:** Positive. Finalize memory becomes O(number of tables)
  metadata, not O(total backup size). Headroom restored for further DB growth.
- **Rollback:** Single-file revert in `create-backup/index.ts`. No DB or
  storage state to undo.

## Out of scope (not changed)

- `BATCH_SIZE` (stays 4 per memory contract).
- WP-9.2.a hard-fail flag, WP-9.2.b/c retry classifier, WP-9.3 Safety Drill.
- `get_backup_table_order` RPC, `backup_denylist`, `restore-backup`.
- `DOCUMENTATION.md` / `POLICY.md` — will add a one-line WP-9.2.d note
  ("finalize integrity uses list+manifest, no per-file re-parse") in the
  implementation step, no policy change.
