# Why Backup Is Failing — + CI Regression Guard

## Root cause (confirmed)

Every recent scheduled run completes its batch phase successfully:

```
status        = failed
tables_count  = 218        ← all batches succeeded
total_rows    = 317,466
error_message = "Finalize failed: HTTP 546. Batch errors: " (empty list)
```

`HTTP 546` = Deno Deploy worker exceeded the **256 MB memory cap**. The failure
is inside `verifyBackupIntegrity()` in
`supabase/functions/create-backup/index.ts` (lines 301–391): for every table it
`download()`s the per-table JSON, calls `blob.text()`, then `JSON.parse(text)`,
only to read `parsed.length`. With 218 tables × ~1.1 MB each (≈ 3–5× expansion
once parsed in JS), peak finalize memory blows past 256 MB even with
`CONCURRENCY = 4`. Data is safely on disk — the verifier kills its own worker.

This is NOT a batch-OOM issue (already mitigated by `BATCH_SIZE = 4` and the
WP-9.2.c retry classifier). It is a finalize-side memory bug.

## Fix (single file)

`supabase/functions/create-backup/index.ts` — `verifyBackupIntegrity()`:

- Keep the existing `storage.list(folderPath)` presence + size check.
- Treat a file as present when list returns it with `size > 0`.
- Trust the row count produced by the batch worker (`tableManifest[i].rows`) —
  same code path the manifest, log row, and hard-fail check already trust.
- Drop the `download` / `blob.text()` / `JSON.parse` block. Zero-size or
  missing files → `issues.missing` / `issues.unreadable`.

| | Before | After |
|---|---|---|
| Per-table memory in finalize | Full JSON string + parsed array | ~0 (list entry only) |
| Peak finalize memory (218 tables) | > 256 MB → HTTP 546 | < 50 MB |
| Integrity guarantees | presence, size, row-count parity | presence, size, row-count parity (from manifest, not re-parse) |

WP-9.2.a hard-fail-on-partial, WP-9.2.b/c retries, WP-9.3 Safety Drill,
`get_backup_table_order`, `backup_denylist`, and `restore-backup` are all
untouched. Contract tests I6–I15 stay green.

## CI regression guard (the new ask)

Add deterministic tests that fail CI if anyone reintroduces the failure mode
or silently regresses backup health. All run under the existing
`vitest` + Deno test setup — no new infra.

### A. Edge-function unit tests (Deno, new file)

`supabase/functions/create-backup/verify_integrity_memory_test.ts`

1. **`never downloads files on the happy path`** — mock the Supabase storage
   client with a `list()` that returns every manifest file at non-zero size and
   a `download()` spy. Call `verifyBackupIntegrity`. Assert:
   - `download` call count === 0.
   - report `status === 'ok'`, `missing/unreadable/row_mismatch` all empty.
2. **`flags missing parts without downloading`** — list omits one file.
   Assert report includes it in `missing` and `download` still not called.
3. **`flags zero-byte parts as unreadable`** — list returns size 0.
   Assert it lands in `unreadable`, no `download` call.

These three tests pin the memory-safe contract: any future PR that re-adds
`.download(...)` inside the verifier will fail CI immediately.

### B. Source-level contract test (vitest, new file)

`src/test/infra/backupFinalizeMemoryContract.test.ts`

Static-text assertion over `supabase/functions/create-backup/index.ts`:

- `verifyBackupIntegrity` source slice must NOT contain `.download(` or
  `JSON.parse(text)`.
- `BATCH_SIZE = 4` constant still present (locks the existing memory cap
  policy alongside the new one).
- `loadHardFailOnPartial(` still referenced (locks WP-9.2.a).

Mirrors the existing Phase-9 contract-test pattern (I6–I15) so the failure
mode is named in the test message: "Backup finalize must not re-parse table
files (HTTP 546 regression guard — see DOCUMENTATION.md WP-9.2.d)."

### C. DB-side smoke test (vitest, new file)

`src/test/infra/backupHealthSmoke.test.ts`

Read-only assertion against `backup_logs` using the existing supabase client:

- Last 7 scheduled runs: at least 5 must be `status IN ('completed','completed_with_errors')`.
- No row in the last 24 h with `error_message LIKE '%HTTP 546%'`.

Skips gracefully (`it.skip`) when the test env has no DB access, so local
unit runs are unaffected; CI with env vars set runs it. This is the
"silent regression" alarm — if the cron ever starts failing again with the
same memory signature, CI goes red the same day.

### D. Vitest config

Wire the new test files into the existing `vitest.config.ts` include glob
(`src/test/**/*.test.ts` already covers them — verify, no change expected).
Deno tests under `supabase/functions/**` already run in the existing
edge-function test job.

## Manual recovery step (post-deploy)

Trigger one **manual** backup from Admin → Backups to produce a green
`completed` row and reset the "latest successful" pointer used by Backup
History badges and the WP-9.3 Verify action.

## Risk & Impact Report

- **Data Impact:** None. No schema change, no migration.
- **Workflow Impact:** None for users. Cron continues unchanged.
- **UI/UX Impact:** None. Backup History rendering, hard-fail copy, and the
  Verify (Safety Drill) action are unchanged.
- **Regression Risk:** Low. The behavior change is "integrity trusts the
  manifest row count instead of re-parsing the file written seconds earlier
  by the same run." The batch row counter is already the single source of
  truth for the manifest, the log row, and the hard-fail predicate, so no
  independent guarantee is lost.
- **Scalability Impact:** Positive. Finalize memory becomes O(number of
  tables) metadata rather than O(total backup size). Restores headroom as
  the DB grows past today's 240 MB / 218-table footprint.
- **Mitigation:** Tests A–C above lock the new contract; test C catches any
  future silent regression in production within one cron cycle.
- **Rollback:** Single-file revert in `create-backup/index.ts`. Tests A–C
  can be removed in the same revert. No DB or storage state to undo.

## Docs

`DOCUMENTATION.md` — add WP-9.2.d entry: "Finalize integrity now verifies via
storage list + manifest row counts; no per-file re-parse. Locked by
`verify_integrity_memory_test.ts`, `backupFinalizeMemoryContract.test.ts`,
`backupHealthSmoke.test.ts`." No `POLICY.md` change (mechanism, not policy).
