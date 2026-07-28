# 01 — Object Inventory

All inventories are extracted directly from live `pg_catalog` / `information_schema` and stored as CSV in `docs/database/data/`.

| File | Rows | Contents |
|---|---|---|
| `tables.csv` | 248 | Base tables, RLS flag, owner |
| `columns.csv` | — | Every column: type, nullability, default |
| `views.csv` | 11 | 3 views + 8 materialized views |
| `functions.csv` | 464 | Name, args, return, volatility, `security_definer`, `search_path` |
| `enums.csv` | 35 | Enum types and ordered labels |
| `constraints.csv` | — | PK / UNIQUE / CHECK / EXCLUDE |
| `foreign_keys.csv` | 346 | Child, parent, columns, delete rule |
| `indexes.csv` | 657 | Definition, uniqueness, size |
| `policies.csv` | 736 | Table, name, cmd, roles, USING, WITH CHECK |
| `triggers.csv` | 202 | Timing, event, function |
| `grants.csv` | — | Table privileges per role |
| `storage_buckets.csv` | — | Buckets and public flag |
| `storage_policies.csv` | — | `storage.objects` policies |
| `extensions.csv` | 8 | Installed extensions |
| `publications.csv` | — | Realtime publication membership |
| `cron_jobs.csv` | 14 | Schedule, target, credential-embedding flag |
| `table_usage.csv` | 248 | Per-table application usage classification (derived) |
| `function_usage.csv` | 457 | Per-function call-site classification (derived) |
| `fk_missing_index.csv` | 171 | FKs with no supporting leading-column index |
| `unused_indexes.csv` | 139 | Non-unique indexes with `idx_scan = 0` |
| `table_stats.csv` | 256 | Size, live/dead tuples, scan counters |
| `unpaged_queries.csv` | 597 | `.select()` call sites with no `range/limit/single` |
| `domain_map.json` | 248 | Table → business domain |
| `app_usage_misc.json` | — | Buckets, invoked edge functions, realtime channels |

## Storage buckets referenced by application code

`avatars`, `branding-assets`, `database-backups`, `review-evidence`, `safety-media`.

## Non-table objects of note

- **Views:** `safety_incidents_with_sla` (SLA projection), `v_profile_email_duplicates` (identity integrity monitor), `eligible_login_users` (auth provisioning gate).
- **Materialized views:** 8 `mv_safety_*` analytics rollups, refreshed every 2 hours by cron job 22 (`refresh_safety_analytics()`), no grants to `anon`/`authenticated`.
