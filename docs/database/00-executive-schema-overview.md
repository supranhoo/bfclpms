# 00 — Executive Schema Overview

**Status:** Current state, read-only audit. **Generated:** 2026-07-28.
**Source of truth hierarchy:** Live database → `src/integrations/supabase/types.ts` → `supabase/migrations/` → application code → tests → POLICY/ADR → prose docs.

## Platform

| Property | Value |
|---|---|
| Engine | PostgreSQL (Supabase managed) |
| Database size | 742 MB |
| Extensions | `plpgsql`, `pg_trgm`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`, `pg_cron 1.6.4`, `pg_net 0.19.5` |

## Object census (verified against live catalogs)

| Object | Count |
|---|---|
| Base tables (`public`) | 248 |
| Views | 3 (`safety_incidents_with_sla`, `v_profile_email_duplicates`, `eligible_login_users`) |
| Materialized views | 8 (all `mv_safety_*`) |
| Functions (`public`) | 464 definitions / 457 distinct names |
| SECURITY DEFINER functions | 375 — **100% have `search_path` pinned** |
| Enums | 35 |
| RLS policies | 736 |
| Triggers (non-internal) | 202 |
| Indexes | 657 |
| Foreign keys | 346 |
| Migration files | 885 |
| Edge functions | 50 |
| Scheduled jobs (`pg_cron`) | 14, all active |

## Headline findings

1. **RLS posture is complete.** 248 / 248 base tables have RLS enabled, and **zero** tables are RLS-enabled-without-policies. No `anon` grants exist on any table. All 8 Safety materialized views have no grants (ticket T-001 confirmed closed).
2. **Type-layer drift is narrow but real.** Tables, views and enums are in perfect sync with `types.ts`. 130 functions are absent from `types.ts`; 125 of those are trigger functions (expected). **5 are RPCs actively called from the app** — all 5 are overloaded, which is why the generator skips them (see `09-schema-drift-report.md`).
3. **One live application defect found.** `bulk-zero-score-non-submitters` queries a non-existent table `kpi_categories` (correct name: `kra_categories`), silently blanking category names in its reports.
4. **Backup coverage is contract-correct.** `get_backup_table_order()` discovers all public base tables minus a 7-row, reason-annotated `backup_denylist`. No hardcoded allowlist.
5. **The dominant performance risk is sequential scanning inside RLS predicates**, not table size. `org_kpi_values` (4,498 rows) has recorded 49.2 M sequential scans reading 181 B tuples.
6. **Schedule/secret hygiene gap.** 13 of 14 `pg_cron` jobs embed an `Authorization: Bearer` / `apikey` header literal in `cron.job.command`.

## Domain distribution

| Domain | Tables |
|---|---|
| Monthly PMS / KPI | 45 |
| Access & Security | 43 |
| Annual Review | 39 |
| Safety (EHS) | 37 |
| Incentive & Increment | 33 |
| Org & Employee Master | 19 |
| Platform Ops / Audit / Backup | 13 |
| Notifications & Email | 5 |
| Cross-cutting / unclassified | 14 |

Machine-readable catalogs backing every number in this set live in `docs/database/data/`.
