# 12 — Migration Roadmap

Sequenced remediation for `10-gap-and-risk-register.md`. Every step is additive or corrective; nothing below drops a column or table without a stated archive step. No migration in this roadmap has been executed — this document is a proposal.

## Wave 1 — Correctness and secrets (immediate, no schema change)

1. **F-01** Fix `kpi_categories` → `kra_categories` in `bulk-zero-score-non-submitters` (two call sites). Add a contract test that scans edge-function sources for `.from('<name>')` and fails on any name absent from `types.ts`.
2. **F-02** Move the cron bearer token into Vault; rewrite the 13 job commands to read it; rotate the exposed credential.
3. **F-14** Rename or re-schedule `weekly-database-backup` to match its actual daily cadence.

Rollback: revert the code change; restore prior cron command text (capture it first).

## Wave 2 — RLS performance (one migration, function bodies only)

4. **F-03** For `access_profiles`, `access_profile_menu_rights`, `org_kpi_data_owners`, `org_kpi_values`, `safety_incident_routing_rules`, `safety_incidents`: replace inline policy subqueries with `STABLE SECURITY DEFINER` helpers and `(select auth.uid())`. `CREATE OR REPLACE` the helpers — grants are preserved. Measure `pg_stat_user_tables.seq_scan` before and after.

Rollback: `CREATE OR REPLACE` the prior policy definitions; behaviour is unchanged by construction, only plan shape moves.

## Wave 3 — Write-path hardening

5. **F-04** Add `WITH CHECK` to the 76 policies lacking it, mirroring each `USING`. Ship per-domain (org master → incentive → platform ops), each with a smoke test that an in-scope actor can still write.
6. **F-09** Remove hard-delete paths for `profiles`; enforce deactivation through `is_active`. Keep `ON DELETE SET NULL` as a backstop but make it unreachable.

Rollback: drop the added `WITH CHECK` clauses (policies revert to prior permissiveness).

## Wave 4 — Type safety and pagination

7. **F-05** Collapse the five overloaded RPC pairs to single defaulted signatures; drop the redundant overload; regenerate types; remove the `as any` casts at the five call sites.
8. **F-06** Triage the 597 unpaged selects; page the five highest-volume tables using the existing `fetchAllRpcPaged` pattern.

Rollback: overload collapse is the only irreversible step — retain the dropped signature's DDL in the migration comment.

## Wave 5 — Lifecycle and hygiene

9. **F-07** Populate `retention_policies` for `org_kpi_data_entry_logs`, `notifications`, `kpi_audit_logs`, `email_logs`; add a sweep job (archive for audit tables, delete for `notifications`).
10. **F-08** Add indexes for the highest-value subset of the 171 unindexed FKs, `CONCURRENTLY`.
11. **F-11 / F-15** Set a retention date for the 19 dated repair ledgers and the 3 PK-less snapshots; move them to an `archive` schema (out of `public`, therefore out of Data API scope but still explicitly backup-listed or denylisted with a reason).
12. **F-12** Re-measure index usage across a full review cycle, then drop application-owned zero-scan indexes.
13. **F-10** Consolidate overlapping SELECT policies on `review_submissions` and `profiles`.
14. **F-13** Replace the tautological assertions in `src/test/rls-policies.test.ts` with live-catalog checks.

## Guardrails for every wave

- One concern per migration; `GRANT` block accompanies any new `public` table.
- No `ALTER DATABASE`; no changes to `auth`, `storage`, `realtime`, `vault` schemas.
- Any new `public` table is automatically in backup scope via `get_backup_table_order()`; exclusions require a `backup_denylist` row with a written reason.
- Each wave lands with its own regression test and a stated rollback.
