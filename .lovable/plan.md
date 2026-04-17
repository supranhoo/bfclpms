

## RCA: Backup Failures + Stuck "Running" Backup

### What's Actually Happening (Evidence-Backed)

| # | Evidence | Source |
|---|----------|--------|
| 1 | Cron `weekly-database-backup` (misnamed — actually **daily at 17:00 UTC = 22:30 IST**) fires successfully every day | `cron.job_run_details`: 10/10 "succeeded" |
| 2 | Function inserts a `running` row every day at 17:00:02 — so **auth passes** and it starts processing | `backup_logs`: row created, status=`running` |
| 3 | Each failed row's `completed_at` is **exactly 23h 59m 58s** after `created_at` | `backup_logs.duration_minutes ≈ 1440` |
| 4 | Each failure has `tables_count=0`, `total_rows=0`, `error_message="Timed out: backup was running for more than 30 minutes"` | `backup_logs` |
| 5 | Today's 17:00 UTC row is still `running` because the next day's cleanup hasn't run yet (it will at tomorrow 17:00) | Screenshot |
| 6 | `create-backup` edge function has **zero log entries** | `supabase--edge_function_logs` |
| 7 | Manual backups (latest 13 Apr 03:55) **succeed** in ~2.5 min | `backup_logs` row 84862696 |

### Root Cause

The **scheduled** backup path uses a different code path than manual backup:

- **Manual backup** (`useBackups.ts` → `handleInit` + `handleBatch` × N + `handleFinalize`): the **client orchestrates** ~10 separate edge function invocations, each well within the 150s wall-clock limit. ✅ Works.
- **Scheduled backup** (`handleScheduled` at line 414): tries to do **everything in ONE 150s invocation** — 81 tables in sequential batches of 8, plus storage manifests for 2 buckets, plus DB writes. The time guard (line 441, `TIME_LIMIT_MS = 100_000`) is meant to break out gracefully and write `partial` status. But:

  > **The Edge Function platform kills the worker (SIGKILL) at ~150s wall-clock OR on CPU/memory limits BEFORE the finalize block at line 478–534 can run.**

  Result: the `running` row in `backup_logs` is **orphaned** — never updated to `partial` / `completed` / `failed`. The next day's cron invocation runs the cleanup (lines 422–430) which sweeps any `running > 30 min` and marks it `failed` with the generic "Timed out" message. That's why every failed row shows ~24h duration with 0 tables — the duration is meaningless (it's just "how long until next cron"), and the 0 tables means the function got killed before writing any progress back to the log row.

  **Why no edge function logs?** Either the platform discards logs from killed workers, or the function is being aborted before the log buffer flushes. The absence of logs is itself a symptom of hard process termination, not a clean error.

### Why It Worsened Recently

Looking at the table list (81 tables), heavy ones added over time:
- `kpi_audit_logs`, `kpi_observations`, `kpi_observation_replies`
- `notifications`, `email_logs`, `email_dispatch_queue` (only these 3 are pruned to 90 days)
- `org_kpi_value_history`, `kpi_audit_logs`, `org_kpi_data_entry_logs`

A single `fetchAllRows` for any one of these (no pagination cap, page size 1000, sequential) can take 30–60s alone. With 8 tables fetched in `Promise.all` per batch and 10 batches, the function easily exceeds 150s before reaching finalize.

### Why Manual Backups Succeed

The client breaks the work into ~10 separate edge function invocations, each fetches 8 tables in parallel and returns within 30–60s. The client then aggregates and calls finalize as the 11th invocation. The 150s wall-clock limit is never hit per call.

### The Fix Plan

**Goal:** Make scheduled backups use the **same chunked orchestration model** as manual backups (which we know works), instead of the all-in-one self-contained path that gets killed.

#### Phase A — Immediate Cleanup (DB only, no code)
1. Mark the current stuck `running` row (id `4d240497…`) as `failed` with a clear RCA message.

#### Phase B — Fix the Scheduled Path (code change)
**Option 1 (recommended): Replace `handleScheduled` with chunked dispatch.**
   - Cron invokes `create-backup` once with `{backup_type: 'scheduled', mode: 'init'}`.
   - INIT returns immediately (~1s) after creating the log row + computing batches.
   - INIT then **fires-and-forgets** `EdgeRuntime.waitUntil(...)` background calls for each batch + finalize, using `X-Backup-Internal` header (already implemented at line 241–245) so each runs as a fresh edge invocation with its own 150s budget.
   - Each batch worker call updates the `backup_logs` row incrementally so the UI shows real progress.
   - Final batch's worker triggers the finalize step.
   - Result: no single invocation exceeds ~30s; identical reliability to manual backup.

**Option 2 (simpler safety net only):** keep `handleScheduled` but wrap the entire body in a `try/finally` that **always** writes a final status to `backup_logs` (even on partial completion or imminent timeout via `AbortSignal`), and reduce `TIME_LIMIT_MS` to **80_000** to leave more buffer for finalize writes. Less robust — still likely to fail on heavy tables — but a one-line-style fix.

**My recommendation: Option 1.** It uses the proven chunked engine; we only need to add a small dispatcher.

#### Phase C — Operational Hardening
1. **Rename the cron job** from `weekly-database-backup` → `daily-database-backup` (matches actual schedule of `0 17 * * *`).
2. **Add an alert row** in `system_settings` so admins see a banner when the latest backup older than 26h is `failed` or `running`.
3. **Update `mem://infrastructure/database/optimized-backup-engine`** noting that scheduled backups must use the dispatcher pattern, never the self-contained path, due to the 150s limit.

### Risk & Impact

| Area | Impact |
|------|--------|
| Data | None — backups themselves don't mutate business data; cleanup of stuck row is just a status flip |
| Workflow | None — admins still trigger manual backups the same way |
| RLS | None — service role usage unchanged |
| Regression | Low — `handleInit`/`handleBatch`/`handleFinalize` already exist, proven by manual path. Dispatcher just chains them server-side via background tasks |
| Mitigation | Add per-batch progress writes so a future incomplete run is visible mid-flight (not just at end) |

### Files Touched

| File | Change |
|------|--------|
| `supabase/functions/create-backup/index.ts` | Replace `handleScheduled` with chunked dispatcher using `EdgeRuntime.waitUntil` + internal HTTP calls; add per-batch log row updates |
| Migration | One-shot UPDATE: mark stuck `4d240497…` as `failed` with explanatory RCA message |
| Cron job rename (no migration — managed via `update-backup-schedule` next time admin saves; or one-time SQL to rename) | Optional cosmetic |
| `DOCUMENTATION.md`, `POLICY.md` | v2.65.x — RCA + new scheduled backup architecture |
| `mem://infrastructure/database/optimized-backup-engine` | Updated note about chunked-only scheduled execution |

### Expected Outcome

- Tomorrow's 17:00 UTC scheduled backup completes successfully in 2–4 minutes (same as a manual backup), `backup_logs` shows `completed`, file appears in storage.
- The "stuck running" UI state is impossible because the dispatcher writes a definitive final status; a watchdog still sweeps any anomaly.
- Existing 72 historical backup files are untouched.

