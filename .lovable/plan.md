

## Plan — Forward-Cascade Scope Change + OKV Migration Helper + Auto-Pull Activation

Three related Org KPI governance gaps. Doing them in one loop because they share the same RPC + UI surface (`useChangeOrgKpiScope` + Admin "Org KPI Management" tab).

### 1. Cascade Scope Change Forward

**Where**: `src/hooks/useOrgKpiManagement.ts` → `useChangeOrgKpiScope`, plus the dialog that calls it.

**Change**:
- Extend mutation input with `cascadeMode: 'current_only' | 'current_and_future'`.
- New atomic RPC `change_org_kpi_scope_cascading(category_id, kra_name, kpi_name, base_period, base_year, new_scope, cascade_forward bool)`:
  - Resolves all `(period, year)` tuples ≥ base period that are **not locked** (joins `review_period_locks`).
  - For each open future period, updates `kpis.org_level_scope` for matching `is_org_level=true` rows.
  - Calls the OKV migration helper (see #2) per period.
  - Returns per-period rowcounts + a list of skipped locked periods.
  - Audit-logs `ORG_KPI_SCOPE_CASCADED` with `performed_by = NULL` (system) plus `triggered_by = admin_user_id` in metadata.
- UI: add a checkbox in the existing "Change Scope" dialog → "Apply to all open future periods". Show preview of which periods will be touched (dry-run via the same RPC with `cascade_forward=false` returning the resolution list).

### 2. OKV Migration Helper

**Where**: New SQL function `migrate_okv_on_scope_change(category_id, kra_name, kpi_name, period, year, old_scope, new_scope)` called by the cascading RPC and by the existing scope change path.

**Behavior matrix**:

```text
old_scope  →  new_scope          Action
─────────────────────────────────────────────────────────────
employee   →  department         Aggregate per-employee OKVs
                                 into one per department.
                                 Aggregation = AVG (numeric) or
                                 MAX of submitted_at (qualitative).
                                 Source values archived in
                                 okv_migration_history.

employee   →  organization       Aggregate ALL employee OKVs
                                 into one org-wide OKV. Same
                                 aggregation rule.

department →  organization       Aggregate department OKVs into
                                 one org-wide OKV.

department →  employee           Split: create one draft OKV
                                 placeholder per assigned
                                 employee, copying dept value
                                 as the suggested achieved.

organization → department        Split: one draft OKV per dept
                                 that has assigned employees,
                                 seeded with org value.

organization → employee          Split: one draft OKV per
                                 assigned employee, seeded with
                                 org value.
```

- All migrations preserve `propagated`/`approved` status when aggregating (the higher-scope OKV inherits the most-advanced status of its sources). Splits always produce `draft` because each new owner must reconfirm.
- New table `okv_migration_history` (id, original_okv_id, new_okv_id, action, old_scope, new_scope, original_value, original_status, migrated_at, migrated_by) — gives admins a one-click revert path if a cascade was wrong.
- All writes inside a single transaction per period.

**What this does NOT do**: it does not re-trigger propagation. The new/migrated OKVs sit at their inherited status; if they were `propagated`, child KPIs already have values and stay put. If a split results in `draft` OKVs, the Data Owner gets them in their queue (existing UX).

### 3. Activate `enable_org_kpi_autopull`

- Single `UPDATE app_settings SET enable_org_kpi_autopull = true WHERE id = '00000000-0000-0000-0000-000000000001'`.
- Done via the insert/update tool (data, not schema).
- Admin UI already exposes the flag (from Phase B2) — flipping it server-side and verifying the trigger `trg_autopull_propagated_org_kpi` fires on a synthetic late-joiner insert in a dry test.

### Execution sequence

1. Pre-flight `cloud_status` → must be `ACTIVE_HEALTHY`.
2. **Migration**: create `okv_migration_history` table + RLS, create `migrate_okv_on_scope_change` function, create `change_org_kpi_scope_cascading` RPC.
3. **Frontend**: extend `useChangeOrgKpiScope` (new param `cascadeMode`), add a new hook `useScopeCascadePreview` for the dry-run, update the "Change Scope" dialog with the checkbox + preview list of affected periods.
4. **Tests**: Deno unit tests for the migration helper covering all 6 transitions with synthetic data.
5. **Activation**: `UPDATE app_settings ... = true`. Verify with a test insert that the autopull trigger fires (then roll back the test row).
6. **Docs/Memory**:
   - `DOCUMENTATION.md` v2.66.5 changelog entry.
   - `docs/specs/org-kpi-data-entry-spec.md` → new §4.3 "Scope Change Cascade & OKV Migration".
   - Update `mem://features/admin/org-kpi-management-suite` with the cascade + migration matrix.

### Risk & Impact Report

- **Data Impact**: Aggregations average numeric OKVs — the source values are preserved in `okv_migration_history` for revert. Splits create new OKV rows; no source data lost. RLS on `okv_migration_history` restricted to admin role.
- **Workflow Impact**: Cascading forward respects `review_period_locks` — never touches locked months. Splits to `draft` re-queue Data Owners (intended). Aggregations preserve approved status — no regression of in-flight reviews.
- **UI/UX**: One new checkbox in an existing dialog, one new preview panel. Default = `current_only` (existing behavior). No nav changes.
- **Regression Risk**: Medium — aggregation logic must handle qualitative vs numeric vs binary correctly. Mitigated by per-transition unit tests + the audit history table letting admins revert.
- **Auto-pull Activation Risk**: Low — trigger has been deployed and dormant since v2.66.3. Activation is a single boolean flip; verified by synthetic insert + immediate read of the resulting `kpis.achieved_value`.
- **Mitigation**: All writes audit-logged; `okv_migration_history` enables manual revert; preview-before-cascade in UI; locked-period skip list returned to admin.

### Deliverables

- New RPCs: `change_org_kpi_scope_cascading`, `migrate_okv_on_scope_change`.
- New table: `okv_migration_history` (+ RLS).
- Extended hook + dialog with cascade option and preview.
- Deno tests for the 6 transition matrix.
- `enable_org_kpi_autopull = true` in `app_settings`.
- DOCUMENTATION.md v2.66.5 entry, spec §4.3, memory update.

### Out of scope

- Re-propagating the 4 OKVs from Phase A2 (still pending your call).
- Backfilling `okv_migration_history` for prior manual scope changes (no source data exists).

