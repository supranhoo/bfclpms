# Phase 9 — Safety Backup-Gap Closure

**Status (Phase 9.2 WP-a):** SHIPPED — hard-fail-on-partial flag.
**Status (Phase 9.1):** SHIPPED — diagnostic + regression locks.
**Phase 8:** stays CLOSED. Menu CAPA invariants re-verified 24/24 green.

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
| Batch reliability root-cause: retry-with-backoff on `HTTP 546` / `RateLimitError`, `BATCH_SIZE_RETRY=2` | Phase 9.2 WP-b | After observing the next scheduled run with WP-a flag at default `true` (Gate B). |
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
