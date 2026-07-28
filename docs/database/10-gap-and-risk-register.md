# 10 — Gap & Risk Register

Severity: **S1** act now · **S2** next cycle · **S3** planned hygiene.

| ID | Sev | Area | Finding | Evidence | Recommended action |
|---|---|---|---|---|---|
| F-01 | S1 | Defect | `bulk-zero-score-non-submitters` reads non-existent table `kpi_categories`; category names silently blank in both preview and execution reports | `supabase/functions/bulk-zero-score-non-submitters/index.ts:280,464`; table absent from `tables.csv` | Rename to `kra_categories`; add a regression test asserting no unknown table names in edge functions |
| F-02 | S1 | Secrets | 13 of 14 `pg_cron` jobs embed a live `Authorization: Bearer` / `apikey` literal in `cron.job.command` | `data/cron_jobs.csv` | Move the credential into Vault and reference it from the job body; rotate afterwards |
| F-03 | S1 | Perf | Per-row RLS subqueries: 49 M–108 M sequential scans against 1–4,498-row lookup tables (`access_profiles`, `org_kpi_data_owners`, `org_kpi_values`, `access_profile_menu_rights`, `safety_incident_routing_rules`) | `pg_stat_user_tables` | Wrap lookups in `STABLE SECURITY DEFINER` helpers; use `(select auth.uid())` in policy predicates |
| F-04 | S2 | Security | 76 write-capable policies have no `WITH CHECK`, so the post-image of an UPDATE is unconstrained | `data/policies.csv` | Add `WITH CHECK` mirroring each `USING`; prioritise `employee_incentive_records`, `app_settings`, `backup_logs`, org-master tables |
| F-05 | S2 | Type safety | 5 actively-called RPCs absent from `types.ts` because each has 2 overloads, forcing `as any` at every call site | `09-schema-drift-report.md` | Collapse each overload pair to one defaulted signature; drop the redundant one |
| F-06 | S2 | Scale | 597 client `.select()` call sites with no pagination or row cap, against a hard 1,000-row PostgREST ceiling | `data/unpaged_queries.csv` | Triage by expected row count; page `profiles`, `kpis`, `review_submissions`, `org_kpi_values`, `notifications` first |
| F-07 | S2 | Lifecycle | No retention enforcement on `org_kpi_data_entry_logs` (108 MB), `notifications` (91 MB), `kpi_audit_logs` (53 MB), `email_logs` (31 MB) — ~38% of the database and growing unbounded | `data/table_stats.csv` | Define retention in `retention_policies` and add a sweep job; audit tables archive rather than delete |
| F-08 | S2 | Integrity | 171 foreign keys with no supporting index; parent deletes and org-scope joins do full scans | `data/fk_missing_index.csv` | Index the reviewer-pointer and `access_profile_org_scope` FKs first |
| F-09 | S2 | Integrity | 65 FKs use `ON DELETE SET NULL` on reviewer pointers — the mechanism behind the orphaned-review incidents | `pg_constraint` | Forbid hard deletion of `profiles`; enforce deactivation via `is_active` only |
| F-10 | S3 | Perf | 21 permissive policies on `review_submissions`, 19 on `profiles` — all OR-evaluated on every access | `pg_policy` | Consolidate overlapping SELECT policies behind one helper |
| F-11 | S3 | Hygiene | 19 dated repair/audit tables and 13 apparently-unused tables still live in `public` and inside backup scope | `data/table_usage.csv` | Set a retention date for `*_2026_*` ledgers; confirm-then-retire the unused set |
| F-12 | S3 | Hygiene | 139 non-unique indexes with zero scans | `data/unused_indexes.csv` | Re-measure across a full review cycle, then drop application-owned entries |
| F-13 | S3 | Docs | `src/test/rls-policies.test.ts` asserts 46 tables / 8 definer functions vs live 248 / 375, and passes tautologically | test source | Replace with a live-catalog assertion or delete |
| F-14 | S3 | Ops | Cron job `weekly-database-backup` runs daily (`0 17 * * *`) | `data/cron_jobs.csv` | Rename or re-schedule to match intent |
| F-15 | S3 | Integrity | 3 tables have no primary key (frozen snapshots) | `pg_constraint` | Acceptable; add to the retirement list with F-11 |

## Explicitly verified as healthy — do not re-litigate

- RLS enabled on 248/248 tables; zero tables with RLS and no policy; zero `anon` grants.
- All 375 SECURITY DEFINER functions pin `search_path`.
- All 8 Safety materialized views have no grants (T-001 closed).
- Backup coverage is RPC-discovered with a 7-entry, reason-annotated denylist — no hardcoded allowlist (contract test in place).
- Roles are stored in `user_roles` / `safety_user_roles`, never on `profiles`.
- Tables, views and enums are in exact sync with `types.ts`.
