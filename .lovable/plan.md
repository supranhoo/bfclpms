## Phase 9.1 — Safety Backup Gap: Diagnostic + Regression Locks (items 1+2 only)

**Recommendation:** Ship items 1+2 first, defer item 3 (hard-fail flag) until item 1's diagnostic confirms what the 24 missing tables actually are. This keeps Phase 9.1 zero-behavior-change and lets us scope item 3 with evidence.

### Scope

1. **G-4 diagnostic (read-only)** — one SELECT comparing `information_schema.tables` (public BASE) minus `backup_denylist` against `get_backup_table_order()` output. Persist the 24-table delta to `docs/safety/phase9/backup-gap-diagnostic.md` with per-table classification (partition child / FDW / inheritance leftover / legitimately missing). Hard escalate if any row matches `safety_*`.

2. **Shrink-guard regression test** — new file `src/test/safety/phase9/backup-coverage-contract.test.ts`, vitest, static source scan only. Asserts:
   - `create-backup/index.ts` calls `supabase.rpc('get_backup_table_order')`
   - No regex match for hardcoded `safety_*` table literals in `create-backup` or `restore-backup`
   - `STORAGE_BUCKETS` array includes `safety-media`, `review-evidence`, `avatars`
   - `restore-backup/index.ts` calls the same RPC
   - `BATCH_SIZE = 4` constant is present in both `handleInit` and `runScheduledChunked` (locks the OOM-fix invariant from existing memory)
   Pattern matches `src/test/safety/phase8/safety-rls-smoke.test.ts` and `src/test/menu/useResolvedMenu-flag-off.test.ts`.

3. **Docs** — append Phase 9.1 section to `docs/safety/phase8-release-readiness.md` successor doc `docs/safety/phase9/README.md` (new) with: evidence snapshot, what shipped, what deferred, rollback. CHANGELOG_2026.md entry.

4. **Memory** — new `mem/infrastructure/database/backup-coverage-contract` describing the regression test contract; index update.

### Deferred to Phase 9.2 (tracked, not skipped)

- **Item 3** — hard-fail flag for `tablesCount < discoveredCount` (gated by `system_settings.allow_partial_backups`). Re-decide after item 1 evidence.
- **Item 4** — sandbox round-trip drill through `safety-drill` edge fn.
- **Batch reliability root-cause** — the three nights of `HTTP 546` / `RateLimitError` are a symptom; underlying fix (smaller batches for large tables, retry-with-backoff) is its own work-package.

### Guardrails

- No migration. No edge-fn deploy. No RPC change. No `backup_denylist` change.
- No Menu Setting / Custom Tabs changes. `menu_overrides_enabled` stays `false`.
- No PMS workflow / scoring / RLS / enforcement change. No release-readiness runtime page.
- Phase 8 stays CLOSED. Menu CAPA 24/24 re-run at end of pass.

### Rollback

- Diagnostic doc + memory: `git revert`.
- Regression test: `rm src/test/safety/phase9/backup-coverage-contract.test.ts`. Zero runtime impact.

### Verification

- `bunx vitest run src/test/safety/phase9/backup-coverage-contract.test.ts` — new tests green.
- `bunx vitest run src/test/menu/` — Menu CAPA 24/24 green.
- `bunx vitest run src/test/safety/phase8/` — Phase 8 SSOT green.
- Paste all three result blocks before declaring Phase 9.1 done.

### Out of scope

Switching backup behavior, editing RPC, UI changes, Phase 9.2+.
