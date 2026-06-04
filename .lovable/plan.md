# WP-9.2.b — Backup Batch Retry/Backoff Hardening

## WP-9.2.a status confirmed green
- `system_settings.backup_hard_fail_on_partial = true` row present (verified via DB query).
- Phase 9 contract suite **7/7 green** (I1–I7).
- Full suite: **1736/1737 green**; the 1 failure (`safetyShellIsolation > SafetyHome page renders`) is a pre-existing 5s test-timeout in a TanStack-Query wrapped render, **unrelated to backup/Menu CAPA**. Menu CAPA invariants in scope are green.
- Hard-fail branches present in both `runScheduledChunked` and `finalizeManualBackup` (loader `loadHardFailOnPartial` fails closed).

Proceeding with WP-9.2.b planning per your corrections.

---

## Assumptions
- Root cause of partial backups is transient: `HTTP 546` (Deno Deploy OOM under load) and `RateLimitError` (already partially handled in `callSelf`). All other errors are non-transient and must NOT be retried.
- `BATCH_SIZE=4` (primary) is locked by Phase 9.1 I4 and Phase 8 OOM memory — unchanged.
- The stuck-backup reaper (`reapStuckRunningBackups`) marks any run still `running` after **30 minutes** as failed. This is the effective hard wall-time ceiling; the retry budget must stay well under it.
- WP-9.2.a's hard-fail contract is the terminal authority: retries reduce partials, never override them.

## Clarifications
None outstanding.

## Risk & Impact Report
- **Data Impact:** None. Retries re-read source tables and re-upload chunk artifacts; no writes outside `backup_logs.error_message`.
- **Workflow Impact:** Scheduled runs gain up to 2 retries per failing chunk on transient errors. Manual runs share the same retry helper but their finalize/status path is unchanged except for fewer transient partials.
- **UI/UX Impact:** None new. Existing Backup History `error_message` column carries richer telemetry (attempts + final outcome).
- **Regression Risk (reassessed per your point 1):** Worst case is **every** chunk failing twice on 546.
  - 16 batches × (5s + 15s backoff) = **320 s** added latency, plus 16 × ~10–20 s retry work ≈ **~10–12 min total** worst case on top of baseline.
  - With the 30-min reaper ceiling and observed ~8–12 min baseline scheduled run, this is in-budget but tight.
  - **Mitigation:** add a hard **global retry budget = 8 minutes** (`RETRY_BUDGET_MS = 8 * 60_000`). Once exceeded, remaining failing chunks skip retry and are recorded as failed → hard-fail path (WP-9.2.a) takes over deterministically. Telemetry records "retry budget exhausted".
- **Scalability Impact:** As `discoveredCount` grows, budget protects against retry storms. No DB load increase.
- **Rollback:** Pure edge-fn change. Revert the file. No migration, no schema change.

## Step-by-Step Plan

1. **Extract retry classifier** inside `create-backup/index.ts` (local helper, not `_shared/retry.ts` — that helper retries on broader patterns and we need narrower classification).
   - `isTransientChunkError(status, errMsg) → boolean` returns true ONLY for `status === 546` or `/RateLimitError|Rate limit/i.test(errMsg)` or `status === 429`.
   - Explicitly returns `false` for 4xx (schema/permission/RLS/validation), 5xx other than 546, and `undefined`/network errors with non-transient signature.
   - Verification: unit test covers each branch.

2. **Add chunk-level retry in `runScheduledChunked` only** (manual path untouched at the finalize level — see point 2 below).
   - On `!result.ok && isTransientChunkError(...)`:
     - Retry up to **2 times** with backoff **5s → 15s**.
     - On retry, re-split the failing chunk into halves with `BATCH_SIZE_RETRY = 2` and re-invoke `callSelf` per half. (Primary `BATCH_SIZE = 4` unchanged → I4 stays green.)
     - Each retry attempt subject to the **global `RETRY_BUDGET_MS = 8 min`** check; if budget exhausted, stop retrying and record the chunk as failed.
   - Successes during retry are appended to `tableManifest` exactly like primary-path successes.
   - Verification: Deno tests below.

3. **Preserve manual backup semantics (your point 2).**
   - `finalizeManualBackup` and `handleInit` paths are **not modified** in this WP — the manual backup orchestrator is client-driven and already invokes `callSelf` per batch through a different code path. We will not add a retry loop around `finalizeManualBackup`. The shared classifier helper is exported but only WIRED into the scheduled loop in this WP.
   - WP-9.2.a's manual hard-fail branch (`hardFailManual && partialManual`) stays the terminal authority for manual runs.
   - Verification: regression test asserts `finalizeManualBackup` source is byte-identical to WP-9.2.a's contract regex (I7 stays green; no new manual-path branches introduced).

4. **Hard-fail preserved (your point 4).**
   - After the loop, if `tablesCount < discoveredCount` and `backup_hard_fail_on_partial=true`, status is `failed` — exactly WP-9.2.a behavior. Retries never downgrade a failure.
   - Verification: new invariant I10.

5. **Telemetry into `error_message`.**
   - Per-chunk summary string: `Batch i/N transient(546|RateLimit) attempt k/2 → recovered|failed (budget Xs left)`.
   - Composed messages appended in-order; no new column.
   - Verification: snapshot-style assertion in Deno test.

6. **Regression tests** added to `src/test/safety/phase9/backup-coverage-contract.test.ts`:
   - **I8:** `create-backup` source contains `BATCH_SIZE_RETRY = 2` and `RETRY_BUDGET_MS` constants; primary `BATCH_SIZE = 4` count unchanged (I4 still ≥ 2).
   - **I9:** `isTransientChunkError` exists and gates retry on 546/RateLimit/429 only; source contains the negative-classifier branch for 4xx.
   - **I10:** Hard-fail predicate from I7 is still present after retry insertion (composition guard: retry path does not bypass `hardFail && shrunk ? 'failed' …`).
   - **I11:** `finalizeManualBackup` source unchanged relative to WP-9.2.a contract — manual semantics preserved (point 2 lock).

7. **Deno unit tests** under `supabase/functions/create-backup/`:
   - `isTransientChunkError` classifier table: 546→true, 429→true, RateLimitError msg→true, 400/401/403/404/422→false, generic 500→false, network err→false.
   - Retry path: mock `callSelf` to return 546 once then success → assert retry fires with `BATCH_SIZE_RETRY=2` and chunk recorded as recovered.
   - Retry exhaustion: mock `callSelf` to fail all retries → assert chunk recorded as failed and (composed with WP-9.2.a) hard-fail status applies.
   - Budget exhaustion: simulate elapsed > `RETRY_BUDGET_MS` → assert subsequent failing chunks skip retry and are marked failed with "budget exhausted" telemetry.

8. **Verify full suite green:** Phase 9.1 I1–I5 + WP-9.2.a I6–I7 + WP-9.2.b I8–I11, plus Menu CAPA (24), plus Phase 8 SSOT (33). The pre-existing `safetyShellIsolation` timeout is out of scope.

## UI Changes
Not Applicable. No new controls. Existing Backup History `error_message` carries richer text automatically.

## Implementation
Deferred to next build pass after this plan is approved.

## Tests
- Vitest invariants I8–I11 in `src/test/safety/phase9/backup-coverage-contract.test.ts`.
- Deno unit tests for classifier, retry success, retry exhaustion, budget exhaustion.
- Full suite expected ~63 green in the Phase 9 contract file.

## DOCUMENTATION.md updates
- `docs/safety/phase9/README.md`: append WP-9.2.b section — classifier (546 / RateLimit / 429 only), 2-retry cap, 5s/15s backoff, `BATCH_SIZE_RETRY=2`, `RETRY_BUDGET_MS=8min`, manual-path-untouched note, hard-fail interaction.
- `CHANGELOG_2026.md`: one entry for WP-9.2.b.

## POLICY.md updates
- New memory `mem/infrastructure/database/backup-batch-retry-policy`:
  - Retry triggers: **only** HTTP 546, HTTP 429, RateLimitError. Never 4xx (schema/permission/RLS/validation) or other 5xx.
  - Attempts: max 2 retries per chunk; backoff 5s then 15s; retry uses `BATCH_SIZE_RETRY=2` (primary `BATCH_SIZE=4` unchanged).
  - Global cap: `RETRY_BUDGET_MS=8min`; once exhausted, remaining failing chunks skip retry.
  - Manual backup finalize/status semantics unchanged; helper exported but only wired into scheduled path in this WP.
  - Hard-fail terminal: exhausted retries + missing tables + `backup_hard_fail_on_partial=true` ⇒ `status='failed'`.
- `mem/index.md`: append reference line.

## Guardrails (per your point 5 + 6, locked)
- No `backup_denylist` change.
- No `get_backup_table_order` RPC change.
- Primary `BATCH_SIZE=4` unchanged (I4 stays green).
- No Menu Setting / Custom Tabs touched; `menu_overrides_enabled=false`.
- No PMS workflow / scoring / RLS / enforcement change.
- Phase 9.3 sandbox drill remains **deferred**.
- Phase 9.1 I1–I5 and WP-9.2.a I6–I7 must stay green.

## Decision justification
- **Local classifier vs `_shared/retry.ts`:** the shared helper retries on a broader 5xx/network pattern. Your point 3 requires **only** 546/RateLimit/429. Inlining the classifier keeps the contract auditable by a single regex in I9 and avoids accidental scope creep if `_shared/retry.ts` is widened later.
- **Re-split on retry (`BATCH_SIZE_RETRY=2`) vs same batch:** a 546 OOM is memory-pressure-driven; retrying the same 4-table chunk would likely OOM again. Halving is the minimum-effective change that preserves the I4 invariant on the primary path.
- **Global retry budget = 8 min:** chosen as ~25% of the 30-min reaper window, leaving baseline scheduled work (~10 min) plus finalize (~1–2 min) comfortably inside the ceiling even in the worst-case retry storm.
- **Manual path left alone in this WP:** scope discipline. WP-9.2.a already gives manual runs the hard-fail terminal. Adding retry there would mix client-driven and server-driven retry semantics in one WP — deferred unless Gate B observation proves it needed.

## Post-implementation notes
After ship, observe the next 1–2 scheduled runs:
- Clean run → close Phase 9.2; reassess whether Phase 9.3 sandbox drill should be scheduled.
- Partial run despite retries → non-transient root cause (schema/permissions/timeout/storage), escalate as a separate ticket, do not tune retry knobs blindly.
