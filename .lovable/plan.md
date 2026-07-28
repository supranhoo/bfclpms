
# Database Schema Reconstruction & Audit — Phase 1 (read-only)

## Assumptions

- This is the audit pass only. No migrations, no application-logic changes, no data repair. The output is documentation plus a gap register awaiting your approval.
- The live database is reachable read-only, so it is the top of the source-of-truth hierarchy (confirmed below).
- Existing invariants listed in your brief (0-is-valid, snapshot immutability, no downstream rewind, additive-only migrations, backup parent-first ordering, etc.) are treated as **constraints on recommendations**, never as things to re-litigate.

## Pre-plan verification (confirmed facts, queried this turn)

Live `public` schema — actual counts vs the figures in your brief:

| Object | Your brief | Live DB (confirmed) |
|---|---|---|
| Tables | 248 | **248** ✓ |
| Views | — | 3 |
| Materialized views | 11 combined | 8 (11 combined ✓) |
| Functions | 334 | **464** (drift — brief understates by 130) |
| Enums | 70 | **35** (drift — brief overstates by 35) |
| RLS policies | — | 736 |
| Tables with RLS disabled | — | **0** ✓ |
| Tables with zero policies | — | **0** ✓ |
| Triggers (non-internal) | — | 209 |
| Indexes | — | 657 |
| SECURITY DEFINER functions | — | 375, of which **0 lack a pinned `search_path`** ✓ |
| JSONB columns | — | 137 |
| Historical repair/audit-snapshot tables | — | ~18 (`*_2026_0*`, `*_repair_*`, `*_archive_seed`) |

Repo — confirmed: 885 migration files, 50 Edge Function directories, `src/integrations/supabase/types.ts` at 17,879 lines. `docs/database/` **does not exist yet**; `docs/specs/` holds 3 files.

Two baseline security postures are therefore already clean and will be documented as such rather than flagged: RLS coverage and SECURITY DEFINER `search_path` pinning. The function/enum count divergence is the first confirmed documentation drift item.

## Source-of-truth hierarchy used

1. Live database catalogs (`pg_catalog` / `information_schema`) — read-only, **confirmed available**
2. `src/integrations/supabase/types.ts`
3. Effective result of `supabase/migrations/`
4. Runtime usage: `src/hooks`, `src/services`, `src/pages`, `src/components`, `src/lib`, `supabase/functions`
5. Contract tests under `src/test`, `src/tests`
6. `POLICY.md`, accepted ADRs, `mem/`, `docs/specs`
7. `DOCUMENTATION.md`, `CHANGELOG_2026.md` (lowest — treated as claims to verify)

Every statement in the deliverables is tagged: `CONFIRMED` / `INFERRED` / `DOC-ONLY` / `OPEN QUESTION` / `SUSPECTED DRIFT`.

## Work plan

### Step 1 — Catalog extraction (machine-readable first)
Run a fixed set of read-only catalog queries and emit CSV/JSON under `docs/database/data/`: `tables.csv`, `columns.csv`, `foreign_keys.csv`, `constraints.csv`, `indexes.csv`, `policies.csv`, `triggers.csv`, `functions.csv`, `enums.csv`, `views.csv`, `storage_buckets.csv`, `cron_jobs.csv`, `extensions.csv`, `grants.csv`, `publications.csv`.
*Verification:* row counts in each CSV match the live counts in the table above.

### Step 2 — Application usage map
Ripgrep the whole app for `.from("…")`, `.rpc("…")`, `.storage.from`, `.channel(`/realtime, `functions.invoke`, insert/update/upsert/delete, embedded PostgREST select strings, unpaged reads (missing `.range`/`fetchAllPaged`), and hardcoded status/enum literals. Join against the catalog to classify every object: actively used / DB-internal only / Edge-Function only / audit-compliance / historical repair / legacy-but-referenced / apparently unused / undetermined. Nothing is marked unused on frontend evidence alone — DB function bodies and Edge Functions are searched too.
*Verification:* every one of the 248 tables carries exactly one classification and at least one evidence path.

### Step 3 — Drift detection (four-way diff)
Live DB ↔ `types.ts` ↔ migration-derived schema ↔ code references ↔ backup manifest (`get_backup_table_order()` + `backup_denylist`). Detects: objects missing from types, code references to non-existent columns, functions redefined with inconsistent signatures across the 885 migrations, duplicate/conflicting policies, remote-only objects with no migration, obsolete enums still referenced in code, and tables absent from backup coverage.
*Verification:* the confirmed function/enum count divergence appears in the report with a per-object breakdown.

### Step 4 — Domain classification & catalogue
Assign all 248 tables to the 8 domains you named (IAM, Org structure, Monthly PMS/KPI, Org-level KPI, Annual Review, Incentives/Increments, Safety, Platform/Audit/Ops), then write the per-table catalogue with the full attribute matrix (purpose, PK, columns, FKs, unique/check, indexes, RLS + policy summary, triggers, app usage, sensitivity, retention, backup coverage, lifecycle status).

### Step 5 — ERDs
Nine Mermaid diagrams: one per domain plus one executive-level. FK-derived edges are solid and labelled `CONFIRMED`; application-logical joins (e.g. text-key KPI matching, canonical-key org-KPI links) are dashed and explicitly labelled as logical.

### Step 6 — Workflow data-flow maps
The 15 workflows you listed, each documented as: tables read → tables written → RPCs → triggers fired → Edge Functions → status transitions → audit rows → notification rows → authorization checks → transaction boundary → failure/retry behaviour.

### Step 7 — Security & RLS matrix
Per-table CRUD policy matrix by role; plus targeted checks for broad `authenticated` grants, missing `WITH CHECK`, recursion-prone predicates, org-scope gaps, PII exposure, `anon`/`public` EXECUTE grants, the `verify_jwt = false` Edge Functions in `supabase/config.toml` (and whether each performs independent authorization), storage bucket policies and signed-URL usage, mutability of audit tables, and any secrets stored in tables. All 375 SECURITY DEFINER functions get an entry: owner, execute roles, search_path, internal authz, tables touched, mutation scope, risk class.

### Step 8 — Integrity & performance audit
Orphan-row probes on every FK-less logical relationship, duplicate master records, nullable-but-UI-mandatory columns, enum/text mismatches, rating-scale inconsistencies, KPI weightage ≠ 100% checks, 1000-row PostgREST cap exposure, N+1 and client-side aggregation, missing indexes on RLS predicates and FK columns, redundant indexes, unbounded JSONB (137 columns triaged), matview grants/refresh strategy, and recursive trigger chains among the 209 triggers. All probes are `SELECT`-only and bounded.

### Step 9 — Gap register, target state, roadmap
Every finding gets the full field set you specified (ID, domain, severity, evidence, current behaviour, risk, minimal recommendation, impacted objects, data-migration need, backward compatibility, rollback, confidence) and a category (defect / drift / security / performance / documentation / naming / intentional denormalisation / historical repair object / optional improvement). Target-state proposals stay additive: new columns, `NOT VALID` constraints then validate, concurrent indexes, backfilled snapshots, versioned RPC signatures, compatibility views, deprecation windows.

## Deliverables

```text
docs/database/
  00-executive-schema-overview.md
  01-object-inventory.md
  02-current-schema-catalogue.md
  03-relationship-catalogue.md
  04-domain-erds.md
  05-workflow-data-flows.md
  06-rls-security-matrix.md
  07-functions-triggers-rpc-catalogue.md
  08-backup-retention-coverage.md
  09-schema-drift-report.md
  10-gap-and-risk-register.md
  11-recommended-target-state.md
  12-migration-roadmap.md
  data/*.csv|json          (machine-readable inventories)
```

Given 248 tables / 464 functions / 736 policies, `02` and `07` are the large ones and will be generated primarily from the extracted CSVs so the prose stays consistent with the catalog rather than hand-written.

## Explicitly out of scope this pass

No migrations, no `types.ts` regeneration, no Edge Function or hook changes, no data repair, no `POLICY.md`/ADR edits, no reads of `.env` or secret stores. Only new files under `docs/database/` are created.

## Risk & impact

- **Data impact:** none — read-only catalog and bounded `SELECT` probes.
- **Workflow / UI impact:** none.
- **Regression risk:** none (no application file is touched).
- **Performance:** integrity probes on large tables (`kpis`, `review_submissions`, `org_kpi_values`) are `LIMIT`-bounded and run against the read replica path; no full-table scans without limits.
- **Scalability of the deliverable itself:** catalogues are CSV-backed so they can be regenerated rather than manually maintained.

## Implementation gate

At the end of this pass I will present: top confirmed findings, critical/high issues, drift summary, security summary, integrity summary, performance summary, phased implementation proposal, exact files each phase would touch, migration risk rating, and required production checks — then stop and wait for your explicit approval before any migration is written.

## Open questions (will not block Phase 1)

1. Should the ~18 historical repair tables (`*_2026_0*`, `*_repair_*`) be proposed for archival/retention in the target state, or are they retained indefinitely for compliance?
2. Do you want the gap register to include Low/Informational findings, or Critical/High/Medium only, to keep it actionable?
