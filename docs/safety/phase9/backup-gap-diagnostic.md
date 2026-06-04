# Phase 9.1 — G-4 Backup Coverage Gap Diagnostic

**Pass type:** read-only evidence. No code/DB/runtime change.
**Date:** 2026-06-04.
**Source of truth:** `public.get_backup_table_order()` RPC + `information_schema.tables` + `public.backup_logs`.

## Counts (live DB)

| Metric | Value |
|---|---|
| `public` BASE tables (live) | **202** |
| `public.backup_denylist` rows | **1** (`impl_console_rate_buckets`) |
| Expected RPC output (202 − 1) | **201** |
| Last observed `discoveredCount` (from `backup_logs.error_message` 2026-06-03) | **177** |
| `safety_*` BASE tables (live) | **35** |
| `safety_*` rows in `backup_denylist` | **0** |

## RPC body (verified)

`get_backup_table_order()` is `SECURITY DEFINER`, depth-orders every `public` BASE table minus `backup_denylist`. No `safety_*` filter, no PK filter, no schema filter beyond `public`. Therefore at the moment of this diagnostic, the RPC will return all 201 tables.

## Gap interpretation

The 201 − 177 = **24-table delta is a temporal artifact**, not a coverage hole:

1. `discoveredCount = 177` was the value at the 2026-06-03 17:02 UTC scheduled run.
2. Between that run and this diagnostic (2026-06-04), Phases 7–8 landed migrations adding new `public` tables (Menu Setting CAPA, access profile rights, audit tables, etc.).
3. The next scheduled run will pick them up automatically because discovery is RPC-driven.
4. **Zero `safety_*` tables are excluded.** All 35 are in scope.

Partition-child / inheritance-child explanation is ruled out: `pg_inherits` returns 0 rows for `public`.

## Anomaly noted (not part of G-4, tracked separately)

`public.org_kpi_owner_key_backup_2026_05` has no primary key. The RPC includes it (no PK filter) and `fetchAllRows` paginates by offset, so dump works without a PK. No action required. Flagged so it isn't forgotten if a future RPC change adds a PK requirement.

## Escalation check

Any `safety_*` table present in `public` but not returned by the RPC: **0 rows**. No escalation needed.

## Real gap (carry to Phase 9.2)

G-1 stands and is the binding production issue: 3 of the last 5 scheduled runs (2026-06-01/02/03) produced 4–8-table-short backups due to `HTTP 546` / `RateLimitError` on individual batches. `BATCH_SIZE=4` is already enforced. Item 3 (hard-fail flag) and a root-cause look at batch reliability remain owners for Phase 9.2.

## What this diagnostic changes

Nothing. Read-only. No migration, no edge-fn redeploy, no RPC edit, no `backup_denylist` change.
