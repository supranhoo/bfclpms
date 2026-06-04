# Phase 9 — Safety Backup-Gap Closure

**Status (Phase 9.2 WP-b):** SHIPPED — transient retry/backoff hardening.
**Status (Phase 9.2 WP-a):** SHIPPED — hard-fail-on-partial flag.
**Status (Phase 9.1):** SHIPPED — diagnostic + regression locks.
**Phase 8:** stays CLOSED. Menu CAPA invariants re-verified 24/24 green.

## What shipped in 9.2 WP-b

- `create-backup/index.ts` scheduled path now retries **transient chunk failures only**:
  - Triggers: `HTTP 546` (Deno Deploy OOM), `HTTP 429`, `RateLimitError`. Schema / permission / RLS / validation / other 5xx are **never** retried (`isTransientChunkError`).
  - Up to **2 retries** per failing chunk with **5s → 15s** backoff.
  - Retry re-splits the failing chunk into halves of `BATCH_SIZE_RETRY = 2`. Primary `BATCH_SIZE = 4` is unchanged (Phase 9.1 I4 stays green).
  - Global **`RETRY_BUDGET_MS = 8 min`** wall-time cap (≈25% of the 30-min stuck-backup reaper window). Once exhausted, subsequent failing chunks skip retry and are recorded as failed.
  - Telemetry: per-chunk retry summary appended to `backup_logs.error_message` ("recovered on attempt k/2", "non-transient on retry", "budget exhausted").
- Manual backup finalize/status semantics are **unchanged** in this WP. The classifier is exported for reuse but only wired into the scheduled loop.
- Hard-fail terminal preserved: after retries, if `tablesCount < discoveredCount` and `backup_hard_fail_on_partial=true`, the run still lands as `failed`. Retries never downgrade a failure.
- Contract tests gain I8 (retry constants + primary `BATCH_SIZE=4` unchanged), I9 (`isTransientChunkError` exists and gates on 546/429/RateLimit only), I10 (hard-fail terminal still authority; "budget exhausted" / "non-transient" branches present), I11 (manual `handleFinalize` does not reference the classifier or retry helper). I1–I7 stay green.

### Verification (re-run)

- `bunx vitest run src/test/safety/phase9/` — **11/11 green** (I1–I11).
- `bunx vitest run src/test/safety/` — **103/103 green** (full safety suite, includes Phase 8 SSOT and Menu CAPA-relevant cases).

### Rollback (WP-b)

- Edge fn only: `git revert` the WP-b diff in `create-backup/index.ts` (classifier, retry helper, scheduled-loop call site, constants). No migration, no schema change.
- Tests: remove the I8–I11 cases from `backup-coverage-contract.test.ts`.

## What shipped in 9.2 WP-a

- Migration seeds `system_settings.backup_hard_fail_on_partial = true` (production default). Flag is boolean, true-by-default semantics: **true ⇒ partial backups are marked `failed`** (red pill, excluded from "latest successful" pointers); **false ⇒ legacy `completed_with_errors`** (emergency admin override only, DB-level — no UI toggle in this WP).
- `create-backup/index.ts`:
  - New `loadHardFailOnPartial(supabase)` helper. Fails closed (defaults to `true` on missing row / read error).
  - `runScheduledChunked` post-finalize block now writes `status='failed'` when the flag is `true` AND `tablesCount < discoveredCount`. `error_message` still records the coverage delta + warning summary.
  - `finalizeManualBackup` consults the same flag against the integrity manifest: when `integrity.missing.length > 0` AND the flag is `true`, manual finalize lands as `failed` (vs. `completed_with_errors`).
- Backup History card carries a one-line read-only note explaining the new default semantics and how the flag is overridden. No admin toggle (deliberate friction).
- Contract tests gain I6 (migration seeds row with `'true'::jsonb`) and I7 (source contains the flag loader + the `hardFail && shrunk ? 'failed'` branch + the manual finalize hard-fail predicate). I1–I5 stay green.

### Verification (re-run)

- `bunx vitest run src/test/safety/phase9/` — 7/7 green (I1–I7).
- `bunx vitest run src/test/menu/` — 24/24 green (Menu CAPA invariants).
- `bunx vitest run src/test/safety/phase8/` — 33/33 green (Phase 8 SSOT).

### Behaviour change vs. today (explicit)

Today a partial run lands as `completed_with_errors` (amber pill) and remains restorable. After WP-a with the default `true`, the same partial run lands as `failed` (red pill). **This is stricter than today.** The Backup History UI surfaces both the status and the discovered-vs-backed-up delta in the error column so admins understand why.

### Rollback (WP-a)

- Migration: `UPDATE public.system_settings SET setting_value = 'false'::jsonb WHERE setting_key = 'backup_hard_fail_on_partial';` reverts behaviour to `completed_with_errors`.
- Edge fn: `git revert` the `create-backup/index.ts` diff (loader + two branches).
- UI: `git revert` the Backup History note.
- Tests: remove the I6 / I7 cases from `backup-coverage-contract.test.ts`.

## What shipped in 9.1

- `docs/safety/phase9/backup-gap-diagnostic.md` — G-4 evidence: the 24-table delta is temporal (tables added since the last scheduled run), not a coverage hole; **zero `safety_*` exclusions confirmed**.
- `src/test/safety/phase9/backup-coverage-contract.test.ts` — static source-scan vitest that locks five invariants in `create-backup` / `restore-backup` (RPC-driven discovery, no hardcoded safety allowlist, storage buckets, `BATCH_SIZE=4`).
- `mem/infrastructure/database/backup-coverage-contract` — memory describing what the regression test guarantees.

## What is deferred (tracked, not skipped)

| Item | Owner | Next decision |
|---|---|---|
| Sandbox round-trip drill through `safety-drill` edge fn | Phase 9.3 | Requires non-prod project |

### Gate B (post WP-a)

| Observed outcome | Action |
|---|---|
| Clean run (`tablesCount == discoveredCount`) | Keep flag `true`. Proceed to WP-9.2.b on schedule. |
| Partial run | Status MUST land as `failed` (validates WP-a). Flag stays `true`. Proceed to WP-9.2.b immediately as the root-cause fix. |
| Any run | Do NOT flip `backup_hard_fail_on_partial` to `false` unless explicitly approved as an emergency override. |

## Guardrails honored

- No RPC change. No `backup_denylist` change.
- No Menu Setting / Custom Tabs change. `menu_overrides_enabled` stays `false` in production.
- No PMS workflow / scoring / RLS / enforcement change.
- No release-readiness runtime page.
- Phase 9.1 contracts I1–I5 stay green; new I6/I7 added without weakening any prior invariant.

## Rollback

- Docs: revert the two files under `docs/safety/phase9/`.
- Test: `rm src/test/safety/phase9/backup-coverage-contract.test.ts`. No runtime impact.
- Memory: revert `mem/infrastructure/database/backup-coverage-contract` and `mem/index.md` line.
