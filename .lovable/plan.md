## 1. Assumptions

- "Yesterday's backup" = scheduled run `71112b35…` started 2026-07-29 17:00 UTC (cron `weekly-database-backup`, 0 17 * * *).
- Hard-fail-on-partial (Phase 9.2.a) must stay in force — a partial snapshot must never show as "completed".
- No change to DB schema, RLS, or restore format is wanted.

## 2. Verified facts (from `backup_logs` and `create-backup/index.ts`)

| Run | Status | Tables | Detail |
|---|---|---|---|
| 29 Jul 17:00 | **failed** | 247 / 248 | `Batch 2/62 … transient HTTP 502; sub 2/4 [annual_review_bu_removal_repair_2026_07] failed after 2 retries: HTTP 502` |
| 28 Jul | completed | 247 / 247 | — |
| 27 Jul | completed | 244 / 244 | — |
| 26 Jul | **failed** | 238 / 239 | `Skipping table annual_review_reviewer_resync_audit: Upload …part-000001.json failed: Gateway Timeout` |
| 25 Jul | completed_with_errors | 239 | Batch 2 502, all four sub-batches recovered |

Confirmed by query: `annual_review_bu_removal_repair_2026_07` holds **34 rows / 64 kB** — so this is not a size or memory problem. Data loss exposure of the failed run: one small one-off audit table; the other 247 tables did upload.

## 3. Root cause

The self-invocation of the `create-backup` batch worker intermittently returns **HTTP 502 from the platform gateway**. The existing recovery envelope is too shallow to ride out that window:

- Only **2 retries**, backoff **5 s + 15 s** → the whole recovery attempt spans ~20 s, while the retry budget still had **427 s unused**.
- Retries re-invoke the *whole* batch worker; there is **no retry around the storage `upload()` call itself** (`streamTableToStorage`, lines 134-139 / 181-186), which is why 26 Jul lost a table to a single `Gateway Timeout`.
- Uploads use `upsert: false`, so any re-attempt after a partially-written part file fails permanently instead of overwriting.
- There is **no post-loop reconciliation sweep**: once a batch's retries are exhausted mid-run, the missing table is never re-tried before finalize, even though minutes of budget remain.
- The coverage guard then correctly flags 247/248 and hard-fails the run — correct policy, wrong upstream resilience.

## 4. 5-Why

1. Why did the backup fail? Coverage shrank to 247/248 and hard-fail-on-partial marked the run `failed`.
2. Why did coverage shrink? `annual_review_bu_removal_repair_2026_07` was never uploaded.
3. Why was it never uploaded? Its single-table batch invocation returned HTTP 502 three times (initial + 2 retries) inside a ~20 s window.
4. Why did three attempts all land in the bad window? Backoffs are fixed at 5 s and 15 s and capped at 2 attempts, so recovery cannot outlast a gateway blip longer than ~20 s — despite 427 s of unused budget.
5. Why was that never caught? The retry envelope was tuned in Phase 9.2 for OOM (546) and rate-limit (429), where fast retries work; gateway 502/504 blips were later added to the classifier (9.2.c) **without widening the backoff schedule**, and no end-of-run reconciliation pass exists as a safety net.

## 5. Risk & Impact Report

- **Data impact:** None. No schema, RLS, or manifest-format change. Backup artifacts keep the ADR-082 `<table>.part-NNNNNN.json` shape, so `restore-backup` and `useDownloadBackup` are untouched.
- **Workflow impact:** None for users. Scheduled run wall-time may grow by up to ~2 min in the worst case (only when transients occur); nominal runs (~3-4 min) are unchanged.
- **UI/UX impact:** None. Backup History pills, tooltips, and the Safety Drill action stay as-is.
- **Regression risk:** Medium-low, concentrated in `create-backup`. The Phase-9 contract tests (I8–I15, `backupFinalizeMemoryContract`, `transient_classifier_test`) pin the constants that must not move — `BATCH_SIZE = 4`, `BATCH_SIZE_RETRY = 1`, hard-fail predicates, no-download-in-verify. All changes are additive around them.
- **Scalability impact:** Upload retries are bounded per part file; the reconciliation sweep is bounded by the same `RETRY_BUDGET_MS` wall clock, so worst-case runtime remains capped.
- **Mitigation:** keep every existing constant that a contract test asserts, add new constants alongside; extend the contract tests rather than rewrite them.

## 6. Fix plan (step → verification)

**Step 1 — Idempotent, retried part-file uploads**
In `streamTableToStorage`, wrap both `.upload(...)` calls in a bounded retry (3 attempts, 1 s / 3 s / 8 s) that switches to `upsert: true` from the second attempt so a half-written part is overwritten rather than colliding. Retry only on transient signals (`isTransientChunkError` + `Gateway Timeout`/`Timeout`); re-throw immediately on 4xx/permission errors.
*Verify:* new unit test asserting the upload is re-attempted on a simulated Gateway Timeout and succeeds with `upsert: true`.

**Step 2 — Widen the retry schedule (keep counts contract-safe)**
Change `RETRY_BACKOFFS_MS` from `[5s, 15s]` to `[5s, 15s, 45s, 90s]` — 4 attempts spanning ~2.6 min, still far inside `RETRY_BUDGET_MS = 8 min`. `BATCH_SIZE`, `BATCH_SIZE_RETRY`, and the budget constant are **unchanged**.
*Verify:* existing I8/I9/I10 contract tests still pass; add an assertion that the schedule is monotonically increasing and its sum < `RETRY_BUDGET_MS`.

**Step 3 — End-of-run coverage reconciliation sweep**
After the batch loop and before `finalize`, diff `tableManifest` against `tablesToBackup`. For any missing table, if budget remains, re-invoke the worker one final time per table (sequentially, with `INTER_BATCH_DELAY_MS` spacing). Successful tables are appended to the manifest and counters; failures are appended to `errors` with a clear `reconcile:` prefix.
*Verify:* unit test — a batch that drops one table results in a manifest containing it after the sweep; a table that fails the sweep still hard-fails the run.

**Step 4 — Keep hard-fail authority intact**
No change to `loadHardFailOnPartial` or the shrink predicate. If reconciliation cannot recover a table, the run still ends `failed`. Only the error message gains the reconciliation detail so admins see what was attempted.
*Verify:* re-run the Phase-9 hard-fail contract test unchanged.

**Step 5 — Recover the failed run**
Trigger one manual scheduled-equivalent backup after deployment and confirm `tables_count = discovered_count` and `status = completed`. No repair of the 29-Jul artifact — a failed backup must be re-run, not "verified" (existing policy).
*Verify:* `select status, tables_count from backup_logs order by created_at desc limit 1`.

## 7. UI changes

Not applicable — no component, route, or presentation change.

## 8. Documentation & policy updates

- New **ADR-204 — Backup transient resilience: upload-level retry, widened backoff, reconciliation sweep** (context = 26/29 Jul failures, decision, consequences, rollback).
- **POLICY.md §BACKUP-TRANSIENT-RESILIENCE**: part-file uploads are retried idempotently; the batch retry schedule must fit inside `RETRY_BUDGET_MS`; every scheduled run must attempt a reconciliation sweep before finalize; hard-fail-on-partial remains terminal.
- Update `mem://infrastructure/database/backup-batch-retry-policy` with the new backoff schedule and the sweep.
- `DOCUMENTATION.md` version-history entry.

## 9. Rollback

Revert `supabase/functions/create-backup/index.ts` and the new tests to the pre-ADR-204 commit. No DB migration, no storage-layout change, so previously created artifacts remain restorable either way.

## 10. Technical notes

- Files touched: `supabase/functions/create-backup/index.ts` (only), plus new/extended tests under `src/test/infra/` and `supabase/functions/create-backup/`.
- Constants asserted by contract tests and deliberately left alone: `BATCH_SIZE = 4`, `BATCH_SIZE_RETRY = 1`, `RETRY_BUDGET_MS = 8 * 60_000`, `ROWS_PER_CHUNK = 5000`, `PAGE_SIZE = 1000`, `loadHardFailOnPartial`.
- `_shared/retry.ts` `withRetry` is close but treats any non-4xx as retryable and has a fixed doubling schedule; Step 1 uses a local wrapper that reuses `isTransientChunkError` so the classifier stays the single source of truth.
