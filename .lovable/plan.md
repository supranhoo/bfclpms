## Phase 9.1 — Safety Backup Evidence & Go/No-Go (read-only pass complete)

**Pass status:** Evidence gathered via read-only SELECTs + repo `rg`. No code, no migration, no edge-fn deploy. Menu CAPA re-validated **24/24 green** at end of pass.

---

### 1. Evidence table

| Check | Source | Result |
|---|---|---|
| `public.safety_*` BASE tables in live DB | `information_schema.tables` | **35 tables** (`safety_asset_calibrations` … `safety_user_roles`). Plus 1 view `safety_incidents_with_sla` (excluded from backup by design — views aren't dumpable). |
| `get_backup_table_order()` RPC exists | `pg_proc` | ✅ Present. `SECURITY DEFINER`, `search_path = public, pg_catalog`, returns `(table_name text, sort_rank int)` ordered by FK depth. Algorithm: every `public` BASE TABLE minus `backup_denylist`, topologically sorted by FK depth. |
| `create-backup` uses the RPC (no static safety allowlist) | `supabase/functions/create-backup/index.ts:15` | ✅ Calls `supabase.rpc('get_backup_table_order')`, hard-fails on empty result. Matches Core memory: *"NEVER hardcode a table allowlist."* |
| `restore-backup` uses the RPC | `supabase/functions/restore-backup/index.ts:171` | ✅ Calls the RPC; falls back to `LEGACY_INSERT_ORDER` only if RPC unavailable. |
| `backup_denylist` rows | `public.backup_denylist` | 1 row: `impl_console_rate_buckets` (PMS ephemeral; documented). **Zero `safety_*` denials** — every safety table is in scope. |
| Storage bucket coverage | `STORAGE_BUCKETS` constant + `storage.buckets` | Code lists `['review-evidence','avatars','safety-media']`. DB has exactly those three matching `%safety%`/`%evidence%`. ✅ |
| Discovered-shrink guard | `create-backup` lines 25–42 | ✅ Aborts if `discoveredCount < previousDiscoveredCount`. Tolerance 0. |
| `tablesCount < discoveredCount` guard | `create-backup` lines 700, 727–731 | ⚠️ Downgrades status to `completed_with_errors` and appends `error_message`, but **does NOT abort** and **does NOT block the manifest** — the partial backup is persisted and the Backup History UI marks it amber. |
| Last 5 `backup_logs` rows | `public.backup_logs` | 🚨 **3 consecutive scheduled backups lost 4–8 tables each** to `HTTP 546` (OOM) / `RateLimitError` — 2026-06-03 173/177, 2026-06-02 169/177, 2026-06-01 160/168. Last fully-green run: 2026-06-01 12:28 UTC (164/164, manual). |
| Public table universe | `information_schema` | 202 BASE tables. RPC selects 201 (minus 1 denylisted). Latest discoveredCount in logs = 177 — suggests the RPC is filtering out partition children / FDW / temp leftovers; need to confirm in Phase 9.1. |
| Static scan: any code path bypassing the RPC for safety | `rg "TABLES_TO_BACKUP|safety_[a-z_]+'" supabase/functions/create-backup/index.ts` | No static safety allowlist anywhere. ✅ |

### 2. What's NOT the gap (closed)

- Discovery: 35/35 safety tables are auto-discovered via the RPC. No code change needed for coverage.
- Restore order: RPC-driven, with legacy fallback. No change needed.
- Storage buckets: all three present and listed. No change needed.
- Denylist hygiene: clean; zero safety denials.

### 3. What IS the gap (the real Phase 9 work)

**G-1 — Partial backups persist as "warnings", not failures.** Three consecutive nights produced 4–8-table-short backups. The user can still see them in Backup History as amber pills with a tooltip, but DR posture is degraded silently. Restoring 2026-06-03 would miss 4 tables (likely high-volume ones that OOM the batch).

**G-2 — No regression test locks the invariant that `create-backup` consumes the RPC (not a static list) and that `STORAGE_BUCKETS` includes `safety-media`.** A future refactor could silently regress this.

**G-3 — No regression test locks `safety_incidents_with_sla` as a view (not a base table).** If someone materializes it, it would silently appear in backup scope without being intended.

**G-4 — Discovered-vs-public-base-tables mismatch (202 public BASE tables minus 1 denylist = 201, but discoveredCount=177).** Either the RPC filters partitions/inherited tables we haven't traced, or 24 tables are silently outside backup scope. Needs verification before claiming "all safety covered" with confidence.

### 4. Go / No-Go recommendation

**GO** on a narrow, additive Phase 9.1 work-package focused on **batch reliability + regression locks** — NOT on coverage (already correct):

1. **Diagnose G-4 first** (read-only): list the 24 `public` BASE tables not in `get_backup_table_order()` output, confirm none are `safety_*` (expected: zero), document why each is excluded. If any `safety_*` table is missing, escalate immediately.
2. **Shrink-guard regression test** (vitest, static): assert `create-backup/index.ts` calls `rpc('get_backup_table_order')` and never imports a hardcoded `safety_*` list; assert `STORAGE_BUCKETS` includes `safety-media`, `review-evidence`, `avatars`; assert `restore-backup` has the same RPC call. Pure source-scan, matches `safety-rls-smoke.test.ts` pattern.
3. **Tighten `tablesCount < discoveredCount` to a hard fail** in `create-backup` (configurable via `system_settings.allow_partial_backups`, default `false`). Behind a feature flag so the next scheduled run can be observed before flipping. This is the only behavior change in Phase 9.1.
4. **Add a sandbox drill test** (separate work-package, deferred): integration test that round-trips one safety table through `safety-drill` edge fn. Sized as Phase 9.2.

**NO-GO** on:
- Touching the RPC (it's correct).
- Adding any `safety_*` entry to `TABLES_TO_BACKUP` / `INSERT_ORDER` / `DELETE_ORDER` — none exists as a static list anymore; legacy constant in `restore-backup` is fallback-only.
- Changing `backup_denylist` rows.
- Any UI change to Backup & Restore tab.

### 5. Rollback readiness (for the proposed Phase 9.1)

- Item 1 (diagnostic): read-only, no rollback needed.
- Item 2 (regression tests): `rm -rf src/test/backup`. No DB or runtime impact.
- Item 3 (hard-fail flag): default OFF → identical to today's behavior. Rollback = unset the flag. Code rollback = revert single edge-fn file.
- Item 4 (drill): deferred.

### 6. Guardrails honored this pass

- No new code, no migration, no edge-fn deploy.
- No Menu Setting / Custom Tabs change.
- `menu_overrides_enabled` untouched (stays `false`).
- No PMS workflow / scoring / RLS / enforcement change.
- No release-readiness runtime page.
- Phase 8 stays CLOSED.
- **Menu CAPA re-run end-of-pass: 6 files / 24 tests, all green.**

### 7. Open question for you

For Phase 9.1, do you want to ship **items 1+2 only** (read-only diagnostic + regression tests, zero behavior change) first, and decide on item 3 (hard-fail flag) after seeing item 1's results? Or approve **1+2+3 as a single work-package** with the flag defaulting OFF?

Awaiting your call before drafting the Phase 9.1 implementation plan.
