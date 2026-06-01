
# Backup Feature — RCA and Fix Plan

## What's actually broken

I queried `backup_logs` and read `supabase/functions/create-backup/index.ts`. Two separate, independent bugs:

### Bug A — Manual backup stuck in `running` (the 31 May 11:24 PM row)

- Row `534ffe1c…` shows `status=running` for ~17 hours, `file_size_bytes=130 MB`, `tables_count=161`, `total_rows=169179`, `completed_at=NULL`, no error message.
- These counters are populated **only by the finalize step**. So the batches did upload and finalize updated counters, but the very next `.update({ status: 'completed' })` either never ran or the row was re-set to `running` by a later code path. Looking at `handleInit` / `handleFinalize`, the most likely cause: finalize wrote counters and integrity ran, but the worker hit its 150 s wall-clock or OOM at the final integrity-check write, leaving the row in `running`.
- **There is a 30-minute stuck-row watchdog in `handleScheduled` (lines 666-674), but no equivalent watchdog on the manual path.** So a stuck manual row stays stuck forever until another scheduled run happens to flip it — except scheduled is also broken (Bug B), so nothing ever cleans it.

### Bug B — Every scheduled backup since 22 May fails with `RateLimitError` at batch ~31/37

- `runScheduledChunked` calls `callSelf(...)` in a **tight sequential for-loop** for ~37 batches plus 1 finalize. That's 30–40 self-invocations of `create-backup` within ~30 s through `fetch(/functions/v1/create-backup)`.
- Supabase Edge Functions enforce a per-trace invocation rate limit. The logs confirm it: `RateLimitError: Rate limit exceeded for trace … Retry after ~30s` on batch 31 every single night, then finalize also rate-limits.
- The manual path uses the same `callSelf` pattern from `handleDispatch`, which is why **large manual runs are at the same risk** — they're just below the threshold today.

## Root causes (one sentence each)

1. **No stuck-row watchdog on the manual dispatch path.**
2. **`runScheduledChunked` (and the manual dispatcher) fire too many self-invocations in too short a window with no spacing, no concurrency cap, and no retry-after handling.**

## Fix Plan

### Fix 1 — Recover the stuck row (one-time)

Manual SQL via approved migration / insert tool:
- Mark `534ffe1c…` as `completed_with_errors` with `error_message='Recovered: orchestrator did not reach final status update'` and `completed_at=now()`. Counters and file_size are intact, so the snapshot is usable.

### Fix 2 — Add stuck-row watchdog to manual path

In `handleInit` (manual entry point), run the same cleanup block currently in `handleScheduled` (lines 666-674) so any `running` row older than 30 min is auto-failed before a new manual run is created. Single source of truth: extract into one `reapStuckRunningBackups(supabase)` helper called from both entry points.

### Fix 3 — Add a separate periodic reaper (cron, every 15 min)

A new tiny edge function `reap-stuck-backups` (or a scheduled DB function) that flips any `status='running'` row older than 30 min to `failed`. This way a stuck row clears even if the user never triggers a new backup. Lightweight, idempotent.

### Fix 4 — Respect Edge Function rate limits in `callSelf` orchestration

Modify `runScheduledChunked` and the manual dispatcher equivalent:

1. **Throttle**: insert a small delay between `callSelf` invocations (e.g. `await sleep(800ms)` between batches). At 37 batches that adds ~30 s — well within the orchestrator's wall-clock budget since it runs under `EdgeRuntime.waitUntil`.
2. **Retry-after honoring**: when `callSelf` returns a 429 or the error body contains `Retry after Xms`, parse `X`, `await sleep(X + 500)`, retry up to 3 times before recording the batch as failed.
3. **Optional bounded concurrency**: process batches in groups of 2 with `Promise.allSettled` + same delay between groups. Cuts wall-clock roughly in half while staying well under the rate-limit envelope.
4. **Finalize retry**: wrap the finalize `callSelf` in the same retry-after loop — currently a single rate-limit on finalize wastes the entire run.

### Fix 5 — Make partial runs recoverable instead of `failed`

Today, when finalize hits the rate limit, the run is marked `failed` even though all 37 batch JSON files are sitting in storage. Change behavior: if all batches succeeded but finalize rate-limited after 3 retries, mark as `completed_with_errors` with `error_message='Finalize deferred; rerun finalize from backup row id …'` and expose a "Retry finalize" admin action. Avoids re-uploading 45 MB nightly just to retry one call.

### Fix 6 — Tighten the UI

- Show a "Cancel / Mark Failed" action on rows stuck in `running` > 30 min (admin only, audit-logged).
- Add a "Retry finalize" action for rows in `completed_with_errors` whose error_message starts with `Finalize deferred`.

## What I will NOT change

- `BATCH_SIZE=4` (it exists for the 256 MB OOM ceiling — out of scope).
- `get_backup_table_order()` coverage logic (per Core memory, must stay automatic).
- The `chunked` format itself or `assertCoverageNotShrunk` guard.
- Restore flow (not implicated in either bug).

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | None — fixes don't touch row contents, only status/orchestration. Existing snapshots in Storage are preserved. | One-time SQL recovery is a single-row update with explicit id. |
| Workflow | Nightly scheduled backups will start succeeding again. | Throttle delay (~30 s) keeps total runtime under 2 min — well within Edge background budget. |
| UI | Two new admin actions (cancel-stuck, retry-finalize). | Both gated by admin role + `ConfirmDestructiveDialog` per project policy. |
| Regression | Manual backups gain a watchdog; could in theory reap a legitimate >30 min in-progress run. | 30 min already the chosen threshold; current largest manual run took ~8 min, so safe. Watchdog only triggers on a *new* invocation, never mid-flight. |
| Scalability | Throttle scales linearly with table count. At 161 tables / BATCH_SIZE 4 = ~40 batches × 800 ms ≈ 32 s overhead. Acceptable. | Configurable constant `INTER_BATCH_DELAY_MS` so we can tune. |
| Backup coverage | Unchanged — still `get_backup_table_order()`-driven. | `assertCoverageNotShrunk` retained. |
| Audit | Recovery row gets explicit `error_message`; reaper marks `error_message='Reaped: stuck >30min'`. | Visible in Backup History. |

## Rollback

- All changes are in `supabase/functions/create-backup/index.ts` (revertable) plus one new tiny edge function `reap-stuck-backups` (deletable) and two small UI buttons (revertable).
- No schema changes. No RLS changes. No data migration beyond the one recovery UPDATE.

## Test / Verification Plan

1. Unit-test the new `parseRetryAfterMs(errString)` helper (Vitest, covers `Retry after 30111ms`, `Retry after 1s`, missing field).
2. Unit-test `reapStuckRunningBackups` with a fixture row older than 30 min.
3. Manual smoke: trigger a manual backup, watch it complete; trigger via scheduled cron, watch it complete without rate-limit errors.
4. Confirm Backup History shows all green for the next 3 nightly runs before declaring done.

## Documentation Updates

- `DOCUMENTATION.md` — version-history entry `v2.68 — Backup orchestration rate-limit hardening + stuck-row watchdog`.
- `POLICY.md` — extend the Backup section: "Manual and scheduled paths share a single `reapStuckRunningBackups` watchdog. Self-invocations must be throttled and honor `Retry-After`."
- Memory update: add `mem://infrastructure/database/backup-orchestration-throttling` referencing this change.

---

**Please approve and I'll implement in this order:** Fix 1 (recover row) → Fix 2 + 4 + 5 (single PR to `create-backup/index.ts`) → Fix 3 (reaper) → Fix 6 (UI actions) → docs + tests.
