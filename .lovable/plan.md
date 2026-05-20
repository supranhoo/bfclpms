## Backup Coverage Gap — Risk Report and Recovery Plan

### Findings

The current backup edge function `supabase/functions/create-backup/index.ts` has a hardcoded `TABLES_TO_BACKUP` array containing **115 tables**. The live database has **142 base tables in `public`**. **27 tables are NOT being backed up.**

This is why the recent restore felt "thin" — anything outside the 115-table allowlist was not in the snapshot and therefore could not be restored. Whatever was in those 27 tables at the moment of restore is whatever currently exists; if a restore overwrote/deleted rows there, they are gone from this database. Lovable Cloud retains its own platform-level snapshots that may still contain them.

### The 27 missing tables (current row counts)

**A. KPI Standardization Registry (HIGH value — active feature data)**
- `kpi_definitions` — 120 rows
- `kpi_name_aliases` — 260 rows
- `kpi_standardization_actions` — 245 rows
- `kpi_scanner_skips` — 6 rows
- `kpi_registry_audit_log` — 0 (audit trail; future writes will be lost)
- `registry_suggestion_dismissals` — 0

**B. Access Profile / Menu Access (HIGH value — RBAC config)**
- `access_profiles` — 0
- `access_profile_assignments` — 0
- `access_profile_menu_rights` — 0
- `access_profile_org_scope` — 0
- (All currently empty, but feature is live — any future config would silently be lost.)

**C. IAC (Identity/Access Capability) framework (MEDIUM)**
- `iac_roles`, `iac_capabilities`, `iac_role_capabilities`, `iac_user_role_assignments` — 0 each
- `iac_audit_log` — 7 rows

**D. PMS infrastructure / housekeeping (MEDIUM)**
- `pms_evidence_compression_jobs` — 730 rows (compression job history)
- `okv_migration_history` — 172 rows (Org KPI Value migration ledger — needed to avoid re-running migrations)
- `org_kpi_owner_key_backup` — 233 rows (prior owner-key snapshot)
- `org_kpi_owner_key_backup_2026_05` — 0
- `import_field_settings` — 0
- `custom_reports` — 0
- `locations` — 0
- `review_action_notes` — 0

**E. Audit / security trails (HIGH — compliance)**
- `system_audit_logs` — 1 row
- `email_change_audit` — 5 rows
- `auth_lookup_attempts` — 0

**F. Safety**
- `safety_drill_runs` — 4 rows (parent of `safety_drill_participants` / `safety_drill_findings`, which ARE backed up — restoring children without this parent would break FKs)

### Recovery plan (from Lovable Cloud platform snapshots)

Lovable Cloud / Supabase retains automated daily Point-in-Time-Recovery snapshots independent of our app-level backup. The path:

1. **Identify the cutover** — Pick the timestamp just before the last app-level restore (the action that wiped these tables to current state).
2. **Open a platform restore window** — Request a PITR snapshot from Lovable Cloud at that timestamp into a *staging* schema (not over production) — exposed as `restore_<timestamp>.<table>`.
3. **Selective copy-back** — For each of the 27 tables, diff staging vs production and `INSERT … ON CONFLICT DO NOTHING` the missing rows. Tables to prioritize in order: D + A + E + F + C + B (highest row count and feature criticality first).
4. **Reconcile FKs** — Specifically, restore `safety_drill_runs` BEFORE re-validating already-restored `safety_drill_participants` / `safety_drill_findings`.
5. **Verify** — Row counts per table, plus spot-check 3 records from each.

This step requires the user to request the PITR window from Lovable Cloud support / Cloud → Database → PITR. The migration to copy data back will be authored once the staging schema is available.

### Permanent fix — eliminate the allowlist

Replace the hardcoded `TABLES_TO_BACKUP` array with a **dynamic discovery query** so every new table is backed up automatically the moment it is created.

Implementation in `supabase/functions/create-backup/index.ts`:

```text
1. On init, query information_schema.tables to fetch every
   base table in 'public' (excluding any explicit DENYLIST).
2. Order tables by FK dependency using pg_constraint topological sort
   (so restore order stays valid) — falls back to current tier order
   for unknown deps.
3. Build TABLES_TO_BACKUP at runtime from that query.
4. Maintain only a small DENYLIST for things we intentionally skip
   (e.g. transient cache tables, or supabase-internal schemas — none
   today). New tables are INCLUDED by default.
5. Add a guard: if discovered_count < last_successful_backup_count,
   abort and alert (prevents accidental shrink).
```

### Core directive (workspace-wide rule)

Add the following entry to project memory under Core so every future Lovable session enforces it:

> **Backup coverage is automatic.** The backup edge function MUST discover tables dynamically from `information_schema`. NEVER reintroduce a hardcoded allowlist. Any new table in `public` is backed up by default; exclusions require explicit DENYLIST entry with written reason. The function must abort with an alert if the discovered table count drops below the previous successful run.

Also adds the same rule to `DOCUMENTATION.md` and `POLICY.md` per SSOT policy.

### Regression protection

- Unit test (`src/test/safety/backup-coverage.test.ts`): asserts that the table-discovery query returns ALL `public` base tables and that the DENYLIST is empty or justified.
- Drill update: extend `safety-drill` to fail if any `public` table is absent from the latest backup manifest.

### Risk & Impact

- **Data impact:** No schema change. Backup payloads grow modestly (27 tables, most empty).
- **Workflow impact:** Future backups will take slightly longer; batch size already tuned for memory.
- **Regression risk:** Low. Dynamic ordering must preserve FK order — mitigated by topological sort with safe fallback.
- **Mitigation:** Run one manual backup immediately after deploy, diff manifest against `information_schema` to confirm 100% coverage.

### Deliverables (on approval)

1. Refactor `create-backup` edge function (dynamic discovery + denylist + count-shrink guard).
2. Mirror dynamic ordering in `restore-backup` so unknown-to-prior-version tables still restore.
3. Add unit test for coverage.
4. Update `DOCUMENTATION.md`, `POLICY.md`, project memory Core rule.
5. Author migration to copy 27 missing tables back from PITR staging (once user enables the platform restore window).
