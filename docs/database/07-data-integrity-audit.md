# 07 — Data Integrity Audit

## Keys

| Check | Result |
|---|---|
| Base tables without a primary key | **3** — `dev_report_entries_archive_seed`, `org_kpi_owner_key_backup_2026_05`, `org_kpi_owner_key_backup_2026_06` (all frozen snapshots; acceptable, but they are still inside backup scope) |
| Foreign keys | 346 |
| — `ON DELETE NO ACTION` | 113 |
| — `ON DELETE CASCADE` | 152 |
| — `ON DELETE SET NULL` | 65 |

`ON DELETE SET NULL` on reviewer-pointer columns is exactly the mechanism that produced the orphaned-reviewer incidents (ADR-113, ADR-173): deleting or de-linking a reviewer silently nulls the pointer and the instance falls out of every queue. The mitigation in place is the cascade/succession trigger set plus `OrphanedReviewsTab`; the structural fix would be to forbid hard deletes of `profiles` entirely and rely on `is_active`.

## Referential hygiene

- No application code references a table that does not exist, **except one**: `supabase/functions/bulk-zero-score-non-submitters/index.ts` selects from `kpi_categories` (lines ~280 and ~464). That table has never existed; the real table is `kra_categories`. The query fails silently (`data` is null, no throw), so every category name in the bulk zero-score preview and execution report renders as blank. **This is a live defect** — see `10-gap-and-risk-register.md`, F-01.

## Enum discipline

35 enums, all present in `types.ts`. Status/role enums are the contract surface for the workflow engine; `annual_review_status` and `annual_reviewer_role` must stay in lock-step with the canonical role→status mapping (POLICY §AR-CANONICAL-ROLE-STATUS-MAPPING) — a prior defect wrote the non-existent literal `pending_dept_head` (ADR-168).

## Temporal / lifecycle integrity

- `updated_at` maintenance is trigger-driven (`update_updated_at_column()` family) rather than application-driven — correct.
- Time-dependent validation uses triggers, not CHECK constraints — correct (immutability requirement).
- **Unbounded growth:** `org_kpi_data_entry_logs` (108 MB / 90 k rows), `notifications` (91 MB / 110 k rows), `kpi_audit_logs` (53 MB / 111 k rows) and `email_logs` (31 MB / 93 k rows) together are ~38% of the database. Only `safety_notifications` has a documented prune rule in `create-backup.PRUNE_TABLES`. There is no retention job for the four tables above; `retention_policies` exists as a table but is not enforced against them.
- **Dead-tuple pressure:** `notifications` 5,326 dead rows, `annual_review_responses` 510, `review_submissions` 1,250 — normal, autovacuum is keeping up.

## Historical repair objects

19 tables match the dated repair/audit pattern (`*_2026_05/06/07`, `*_repair_*`, `*_archive_seed`). They are write-once forensic ledgers from the ADR-155 → ADR-187 remediation wave. They are inside backup scope, carry RLS, and have no application reads. They should be archived out of the live schema on a stated retention date rather than accumulating.
