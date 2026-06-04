# Phase 9 — Safety Backup-Gap Closure

**Status (Phase 9.1):** SHIPPED — diagnostic + regression locks.
**Phase 8:** stays CLOSED. Menu CAPA invariants re-verified 24/24 green.

## What shipped in 9.1

- `docs/safety/phase9/backup-gap-diagnostic.md` — G-4 evidence: the 24-table delta is temporal (tables added since the last scheduled run), not a coverage hole; **zero `safety_*` exclusions confirmed**.
- `src/test/safety/phase9/backup-coverage-contract.test.ts` — static source-scan vitest that locks five invariants in `create-backup` / `restore-backup` (RPC-driven discovery, no hardcoded safety allowlist, storage buckets, `BATCH_SIZE=4`).
- `mem/infrastructure/database/backup-coverage-contract` — memory describing what the regression test guarantees.

## What is deferred (tracked, not skipped)

| Item | Owner | Next decision |
|---|---|---|
| Hard-fail flag for `tablesCount < discoveredCount` (`system_settings.allow_partial_backups`) | Phase 9.2 | After one clean scheduled run with current batch settings |
| Batch reliability root-cause (HTTP 546 / RateLimitError on batches 14, 31, 39) | Phase 9.2 | Needs retry/back-off design before any code change |
| Sandbox round-trip drill through `safety-drill` edge fn | Phase 9.3 | Requires non-prod project |

## Guardrails honored

- No migration. No edge-fn deploy. No RPC change. No `backup_denylist` change.
- No Menu Setting / Custom Tabs change. `menu_overrides_enabled` stays `false` in production.
- No PMS workflow / scoring / RLS / enforcement change.
- No release-readiness runtime page.

## Rollback

- Docs: revert the two files under `docs/safety/phase9/`.
- Test: `rm src/test/safety/phase9/backup-coverage-contract.test.ts`. No runtime impact.
- Memory: revert `mem/infrastructure/database/backup-coverage-contract` and `mem/index.md` line.

## Phase 9.2 readiness recommendation

**GO** on Phase 9.2 scoping once: (a) one scheduled run completes 201/201 cleanly under current `BATCH_SIZE=4`, or (b) two consecutive runs show the same shrink pattern — whichever happens first. Phase 9.2 should propose the hard-fail flag + a retry-with-backoff for batches that hit `RateLimitError`, both behind feature flags defaulting OFF.
