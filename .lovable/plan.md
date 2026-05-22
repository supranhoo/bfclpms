# RCA: Why the new backup has fewer rows than the previous one

## What the data actually shows (`backup_logs`)

| Created | Type | Tables | Rows | Status |
|---|---|---:|---:|---|
| 2026-05-22 16:19 | manual | **139** | 125,812 | completed_with_errors (1 unreadable) |
| 2026-05-21 17:00 | scheduled | **134** | 124,244 | completed — *Batch 14/16 failed: HTTP 546* |
| 2026-05-20 17:00 | scheduled | **134** | 124,559 | completed — *Batch 14/16 failed: HTTP 546* |
| 2026-05-20 07:22 | manual | **139** | 126,709 | completed (clean) |

Two distinct anomalies, not one.

### Anomaly 1 — Scheduled backups are silently dropping 5 tables every night

`runScheduledChunked` (line 569) splits 139 tables into 16 batches of 9 (`BATCH_SIZE = 9`) and calls the function recursively for each batch. **Batch 14 fails with HTTP 546** (Deno Deploy "worker memory limit exceeded") on *every* scheduled run. The loop has `continue` on failure (line 597), so the run is finalized as `completed` with only 134 tables and whatever rows those 134 contained — the 5 tables in batch 14 are missing from the manifest entirely.

The shrink-guard (`assertCoverageNotShrunk`) only checks **discovered** table count vs last successful run, not **successfully backed up** count, so it never fires.

→ The screenshot's 21-May (124,244) vs 20-May (124,559) delta of −315 rows is mostly the same 5 missing tables plus normal day-over-day churn in pruned tables (`notifications`, `email_logs`, `email_dispatch_queue`, `safety_notifications` — 90-day rolling window, line 54-59).

### Anomaly 2 — Manual backup on 22-May lost ~900 rows vs 20-May

Both manual runs covered all 139 tables, but 22-May reports `0 missing, 1 unreadable, 0 row mismatch`. One table failed its integrity read and its rows are excluded from the count. Also expected drift from the 4 PRUNE_TABLES (90-day window advanced 2 days).

## Root cause summary

1. **Memory regression in scheduled path.** `BATCH_SIZE = 9` for scheduled (vs `4` for manual at line 377) pushes batch 14 over the 256 MB worker cap → HTTP 546 → 5 tables silently skipped.
2. **Shrink-guard is blind to partial failures.** It validates *discovered* count, not *backed up* count, so a partial run looks healthy in the UI ("completed", green pill) even though coverage shrank.
3. **One unreadable table** in the 22-May manual run (separate, smaller issue — needs log inspection to identify which table).

## Risk & Impact Report

- **Data Impact:** No data loss in `public` — only in backup artifacts. Restoring last night's scheduled backup would recover only 134/139 tables. Rollback integrity broken for the 5 affected tables (in batch 14 of the canonical table order).
- **Workflow Impact:** None for end users; critical for DR/restore.
- **UI Impact:** Backup History card currently shows misleading "completed" pill for partially-failed runs.
- **Regression Risk:** Low — fixes are additive (smaller batches, stricter guard, clearer status).
- **Mitigation:** Align scheduled BATCH_SIZE with manual, harden shrink-guard, surface partial-failure state in UI.

## Plan (Phase 1 — diagnose, Phase 2 — fix)

### Phase 1 — Confirm the failing batch (read-only, no code)
1. Pull `function_edge_logs` for `create-backup` around `2026-05-21 17:00 UTC` and `2026-05-22 16:20 UTC` to (a) confirm batch 14's exact tables and the OOM signature, (b) identify the "1 unreadable" table from 22-May. *Verification: log lines reference the 5 missing table names + the unreadable table name.*

### Phase 2 — Fix (separate build-mode session, gated on Phase 1 findings)
1. **`supabase/functions/create-backup/index.ts`** — change `BATCH_SIZE = 9` → `BATCH_SIZE = 4` in `runScheduledChunked` (line 575) to match the proven manual path. *Verification: next scheduled run completes 16/16 batches with 139 tables.*
2. **Harden `assertCoverageNotShrunk`** — also compare `tables_count` written to `backup_logs` against the previous successful run; if it drops, mark status `completed_with_errors` (never plain `completed`). *Verification: simulated batch failure produces `completed_with_errors`, not `completed`.*
3. **UI** — in `BackupHistory` card, render `completed_with_errors` with an amber pill + tooltip showing `error_message`, so partial runs are no longer indistinguishable from clean ones. *Verification: 21-May row renders amber with the HTTP 546 message visible on hover.*
4. **Unit tests + mock data** — `splitIntoBatches` edge case (139 tables, batch 4), shrink-guard partial-failure assertion, BackupHistory amber-pill render test.
5. **DOCUMENTATION.md + POLICY.md** — record the 256 MB worker limit as the binding constraint on `BATCH_SIZE`, and the policy "any drop in `tables_count` vs the prior successful backup must downgrade status".

### Out of scope (separate ticket)
- The "1 unreadable" table on 22-May — fix after Phase 1 identifies which table and why (likely a row containing a value the JSON serializer chokes on).
- Backfilling missing tables from the 134-table scheduled runs by re-running batch 14 against historical data (not possible — backups are point-in-time; just take a fresh full backup once the fix lands).

## Decision justification

- **Why match BATCH_SIZE to manual's 4 instead of tuning higher:** The manual path has been stable at 4 for months; 9 was an optimistic regression. Matching is the smallest safe change.
- **Rejected alternative — increase worker memory cap:** Not user-configurable on Edge Functions; reducing batch size is the only durable fix.
- **Rejected alternative — retry failed batches inline:** A retry of an OOM batch with the same size will OOM again. Size reduction is the real fix; retry can be added later as belt-and-suspenders.

## Ask before I build
Confirm you want me to (a) just run the Phase 1 log pull and report which 5 tables were skipped + which table was unreadable, or (b) go straight to Phase 2 with `BATCH_SIZE = 4` + shrink-guard + UI pill?
