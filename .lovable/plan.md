## Phase 9.2 — Backup Hard-Fail Protection + Batch Reliability (revised)

**Status:** Revised per your corrections. Awaiting final approval before any code.
Phase 8 stays CLOSED. Phase 9.1 contracts I1–I5 stay green. Menu CAPA stays 24/24.

---

### Flag decision (corrected)

**Name:** `backup_hard_fail_on_partial` (clearer semantics, no double-negative).
**Production default:** `true` — partial backups are NOT acceptable; mark them `failed`.
**Override:** setting `false` is an **emergency/admin-only** escape hatch used to intentionally accept a partial run (e.g., known transient infra outage where a partial restore is better than none). Not flipped after observation — only by explicit admin action with a written reason.

Stored as a single row in `system_settings`:
- `setting_key = 'backup_hard_fail_on_partial'`
- `setting_value = true` (default)
- `description = 'When true (default), any scheduled or manual backup where backed-up table count is below discovered count is marked failed instead of completed_with_errors. Set to false ONLY as an emergency override to accept partial backups; document reason in admin notes.'`

**Behavior change vs. today (explicit):** today, partial runs land as `completed_with_errors` (amber pill) and remain restorable. After WP-9.2.a ships with the default `true`, the same partial run lands as `failed` (red pill) and is excluded from "latest successful backup" pointers. **This is stricter than today.** The Backup History UI surfaces both the status and the discovered-vs-backed-up delta so admins understand why.

---

### Scope — three work-packages, gated, tests ship with each

**WP-9.2.a — Hard-fail flag (ships first)**
- Migration: insert `system_settings` row `backup_hard_fail_on_partial = true`.
- `supabase/functions/create-backup/index.ts` (`runScheduledChunked` and manual finalize): after the per-batch loop, read the flag (default `true` if row missing). If `tablesCount < discoveredCount` AND flag is `true`, set `status = 'failed'` (instead of `completed_with_errors`) and record `error_message` with the delta + offending batch list.
- `src/components/admin/BackupRestoreTab.tsx`: one-line UI note explaining the flag and its production default; no new admin toggle in this WP (override is a deliberate DB-level action documented in PMS Policy).
- Tests (ship with WP-9.2.a):
  - Extend `src/test/safety/phase9/backup-coverage-contract.test.ts` with:
    - I6: `system_settings` migration creates `backup_hard_fail_on_partial` row default `true` (assert by scanning the migration file in `supabase/migrations/`).
    - I7: `create-backup` source contains the `status='failed'` branch keyed off the flag and the `tablesCount < discoveredCount` predicate.
  - One Deno unit test under `supabase/functions/create-backup/` that mocks the flag + table counts and asserts the failed branch is taken.
- Verification gate: I1–I5 still green, I6/I7 green, Menu CAPA 24/24 green.

**Gate B (corrected per your direction)**

After WP-9.2.a ships, observe the **next scheduled run** with flag at the production default `true`:

| Observed outcome | Action |
|---|---|
| Clean run (`tablesCount == discoveredCount`) | Keep flag `true`. Proceed to WP-9.2.b (retry/backoff hardening) on schedule. |
| Partial run | Status MUST land as `failed` (validates WP-9.2.a). Flag stays `true`. Proceed to WP-9.2.b immediately as the root-cause fix. |
| Any run | Do NOT flip `backup_hard_fail_on_partial` to `false` unless explicitly approved as an emergency override. |

No automatic flag flip. No "observation window" to relax behavior.

**WP-9.2.b — Retry-with-backoff on batch failure (root cause)**
- In `create-backup` per-batch loop: when `callSelf` returns `HTTP 546` (OOM) or `RateLimitError`, retry up to 2× with exponential backoff (5s, 15s) at a smaller `BATCH_SIZE_RETRY = 2`. Preserve existing `INTER_BATCH_DELAY_MS` cadence between batches.
- `BATCH_SIZE = 4` stays the primary value (locked by Phase 9.1 contract I4 — unchanged).
- Telemetry: append retry attempts to `error_message` so the run is fully auditable; do not mask retries as success.
- Reuse `supabase/functions/_shared/retry.ts` where compatible (it already skips 4xx, which matches the desired behavior — we only retry 546/Rate-limit).
- Tests (ship with WP-9.2.b):
  - I8: `create-backup` source contains the retry path with `BATCH_SIZE_RETRY = 2`, gated on `HTTP 546`/`RateLimitError`, max 2 retries. `BATCH_SIZE = 4` primary unchanged (I4 stays green).
  - Deno test: mock `callSelf` to return `HTTP 546` once then succeed; assert retry fires and batch is recorded as recovered. Second test: mock `callSelf` to fail all retries; assert batch is recorded as failed and the partial-backup hard-fail path triggers (composition with WP-9.2.a).
- Verification gate: I1–I5 + I6–I8 green, Menu CAPA 24/24 green, Phase 8 SSOT green.

**WP-9.2.c — Folded into a + b above** (no separate ship). Memory + ADR + CHANGELOG land alongside each WP.

---

### Guardrails (unchanged)

- No Menu Setting / Custom Tabs change. `menu_overrides_enabled` stays `false`.
- No PMS workflow / scoring / RLS / enforcement change.
- No `backup_denylist` change. No RPC change. No release-readiness runtime page.
- Phase 8 stays CLOSED. Phase 9.3 sandbox drill stays deferred.
- Phase 9.1 contracts I1–I5 must stay green at every step.

### Rollback

- WP-9.2.a: revert edge-fn diff; migration to set the row back (or drop it — behavior reverts to `completed_with_errors`). UI copy revert.
- WP-9.2.b: revert edge-fn diff; `BATCH_SIZE = 4` single-attempt restored.
- Tests: `git revert` the test additions.

### Documentation deliverables (per WP)

- `docs/safety/phase9/README.md`: append WP-9.2.a then WP-9.2.b sections.
- `CHANGELOG_2026.md`: one entry per WP.
- `mem/infrastructure/database/backup-hard-fail-policy` (new, after WP-9.2.a): flag name, default, inverse-semantics note, override procedure.
- `mem/infrastructure/database/backup-batch-retry-policy` (new, after WP-9.2.b): retry shape, OOM/rate-limit triggers, `BATCH_SIZE_RETRY = 2`.
- `mem/index.md` updates.

### Out of scope

- Admin UI toggle for the flag (deliberate friction — DB-level override only in 9.2).
- Phase 9.3 sandbox round-trip drill.
- Touching the RPC, `backup_denylist`, or storage bucket list.
- Any PMS / Menu work.

---

### Final confirmations needed before I start WP-9.2.a

1. Flag name **`backup_hard_fail_on_partial`** (boolean, default `true`) — OK? Or keep `allow_partial_backups` with inverse semantics documented?
2. UI: one-line read-only note in Backup History tab is sufficient for 9.2 (no admin toggle) — OK?
3. Greenlight to issue the migration + WP-9.2.a code + tests in this build pass once you confirm (1) and (2).
