
# Expand Org KPI Scope — Locked Plan (Phase 1)

## Confirmed Decisions (from §2 clarifications)

1. **Cross-cutting scopes** — Location, PMS Grade, Level are **independent dimensions**, resolved by direct attribute match on `profiles`. They do NOT nest under division/BU/department.
2. **Single-dimension only** in Phase 1. One Org KPI = exactly one scope kind + one target. Composite (e.g., Division + Location) deferred to Phase 2.
3. **PMS Grade & Level storage** — committed to **Option B**: migrate `profiles.pms_grade` / `level` from `text` to FK columns `pms_grade_id` / `level_id` referencing `pms_grades(id)` / `levels(id)`. Done as a **dedicated preparatory migration** before scope migration.
4. **Data Owner** — keyed **per scope target**. `org_kpi_data_owners` gains the same scope-target columns as `kpis` / `org_kpi_values`.
5. **Retro-application** — only **open future periods** in the current fiscal year are touched on scope change. Locked periods skipped.

## Final Scope Set (8 kinds, 2 families)

```text
HIERARCHICAL (tree, mutually exclusive)
  organization > division > business_unit > department > employee

CROSS-CUTTING (attribute, independent)
  location | pms_grade | level
```

## Execution Order (sequential — one migration approval per step)

### Step 1 — Profile FK migration (prep, no UI impact)
- Add `pms_grade_id uuid REFERENCES pms_grades(id)` and `level_id uuid REFERENCES levels(id)` to `profiles`.
- Backfill from existing `pms_grade` / `level` text via case-insensitive trim match on master tables.
- Keep text columns as fallback during transition; mark `DEPRECATED` in comments.
- Report: log rows that fail to match (admin-fixable list).
- **Tests:** `supabase/tests/profile_grade_level_backfill.sql` + `src/test/profileGradeLevelBackfill.contract.test.ts`.

### Step 2 — Extended scope schema migration
- Create enum `public.org_scope_kind` with 8 values.
- Alter `kpis`, `org_kpi_values`, `org_kpi_data_owners`: add `division_id`, `business_unit_id`, `location_id`, `pms_grade_id`, `level_id` (all nullable FK).
- CHECK constraint: `org_level_scope` value matches exactly one populated `*_id` (organization/employee require none beyond existing `employee_id`).
- Indexes: btree per FK; composite `(org_level_scope, review_period, review_year)`.
- Cast `org_level_scope` column to enum (after adding all 8 values).

### Step 3 — Resolver + RPC extensions
- New SECURITY DEFINER `public.resolve_scope_population(scope, division_id, business_unit_id, department_id, location_id, pms_grade_id, level_id, review_period, review_year) RETURNS SETOF uuid`. `is_active = true` baked in; profile-chain JOINs (department → BU → division) handled internally.
- Refactor existing RPCs to delegate to the resolver (extend, don't rewrite): `change_org_kpi_scope_cascading`, `migrate_okv_on_scope_change`, `propagate_org_kpi_value`, `ensure_org_kpi_scope_rows`, `trg_autopull_propagated_org_kpi`, `reconcile_org_kpi_inheritance`, `repair_org_kpi_cycle_anchors`, `diagnose_org_kpi_propagation_gap`, `preview_org_kpi_propagation`, `bulk_scope_preview`, `is_org_kpi_data_owner_for_profile`, `is_org_kpi_audit_employee`, `rpc_kpi_employee_matrix_scope`, `rpc_org_kpi_filled_keys`, `get_org_kpi_data_entry_snapshot`.
- New helper `public.has_scope_membership(uid, scope, target_ids…)` for RLS short-circuiting.

### Step 4 — RLS update (planner-safe)
- Extend `can_view_kpi_row` SECURITY DEFINER (May-28 fix) to recognize the 5 new scope columns via `has_scope_membership` early-exit.
- Maintain scalar-subselect wrapping `(SELECT auth.uid())`, `(SELECT has_role(…))` per RLS-perf memory.
- New SQL test `supabase/tests/rls_extended_scope.sql` — admin / owner / non-owner per scope kind.

### Step 5 — Feature flag
- Insert row in `system_settings`: key `org_kpi_extended_scopes`, default `false`.
- All UI gating reads this flag via existing settings hook; when OFF, UI behaves exactly as today.

### Step 6 — Hooks (frontend, behind flag)
| File | Change |
|---|---|
| `src/hooks/useOrgKpiManagement.ts` | Widen `newScope` union to 8 values; accept scope-target params. |
| `useOrgKpiValues.ts`, `useOrgLevelKpis.ts`, `useOrgKpiSuggestions.ts`, `useOrgKpiSubmissionFallback.ts`, `useOrgKpiImpact.ts`, `useOrgKpiAuditReview.ts`, `useSentBackOrgKpiEmployees.ts`, `useSendBackOrgKpiValue.ts`, `useRollbackOrgKpiPropagation.ts`, `useMarkAsOrgLevel.ts`, `usePropagateOrgKpiValue.ts`, `useBulkReview.ts`, `useEnsureOrgKpiScopeRows.ts` | Read/write new scope-target columns; unknown scope → no-op (forward-compat). |
| `src/lib/orgKpiKey.ts`, `orgKpiGap.ts`, `orgKpiCounts.ts`, `orgKpiStatus.ts`, `orgKpiEmptyState.ts` | Include scope-target id in canonical key. |
| `src/lib/reportFieldRegistry.ts` | New fields `org_kpi_scope`, `org_kpi_scope_target_name`. |
| **NEW** `src/lib/scopeResolver.ts` | Client-side mirror of DB resolver for live previews. Pure-function. |

### Step 7 — UI components (behind flag)
- **NEW** `src/components/admin/ScopeKindSelect.tsx` — 8 options with icons.
- **NEW** `src/components/admin/ScopeTargetPicker.tsx` — switches master-list source by scope kind; searchable; keyboard-nav.
- Update `MarkOrgLevelDialog.tsx`, `AdminKpiCreateDialog.tsx`, `AdminKpiEditorForm.tsx` — use new pickers; live preview "N active employees / D departments".
- `OrgKpiScopeChangeDialog.tsx` — widen union; replace nested `if`s with **transition matrix lookup table** (8×8 → `aggregate | split | reseed | no-op`).
- `OrgKpiMappingDashboard.tsx` — Scope column with kind+target badge + filter chips.
- `OrgKpiDataEntry.tsx` — group by scope kind; adaptive empty-state copy.
- `MobileKpiCard.tsx` — scope badge under KPI name.
- Reports (`KpiStatusTracker`, `KpiScorecardDetail`, `PerformanceReport`) — scope column + scope filter; export columns hidden when user sees only one scope kind (Company-Scoped Reporting memory).

### Step 8 — Tests (mandatory)
| Test file | Coverage |
|---|---|
| `src/lib/scopeResolver.test.ts` | All 8 scopes × is_active × multi-month anchor |
| `src/test/orgKpiExtendedScopes.contract.test.ts` | OKV per scope → propagate → assert correct employee KPI rows materialized |
| `src/test/orgKpiScopeChangeMatrix.test.ts` | All 64 transitions classified correctly |
| `src/test/ensureOrgKpiScopeRows.contract.test.ts` | Extend with new scopes (existing test file, append cases) |
| `supabase/tests/resolve_scope_population.sql` | DB-level resolver with fixture data |
| `supabase/tests/rls_extended_scope.sql` | RLS visibility per scope kind |
| `src/components/admin/OrgKpiScopeChangeDialog.test.tsx` | Transition matrix renders correct warning |
| `src/components/admin/ScopeTargetPicker.test.tsx` | Master list switching, empty state, search |

### Step 9 — Documentation & Memory (same step as code)
- `DOCUMENTATION.md` § Org KPI Scope — rewrite to "8 scopes (2 families)" + resolver flowchart; append Version History row.
- `POLICY.md` § Org KPI — new clauses P-OKV-12 to P-OKV-15.
- `CHANGELOG_2026.md` — current week row 🟢 with sub-bullets per migration / UI / hook.
- `docs/adr/ADR-066.md` — "Extended Org KPI Scope".
- Memory:
  - **NEW** `mem://features/admin/org-kpi-extended-scopes` — overview + resolver contract + feature-flag note.
  - Append to `mem://architecture/security/rls-recursion-management` — `has_scope_membership` helper.
  - Update `mem://index.md` Core line: "Org KPI scope: 8 kinds — hierarchical (org/div/BU/dept/emp) + cross-cutting (loc/grade/level). Use `resolve_scope_population` — never inline."

### Step 10 — Rollout
1. Migrations Steps 1–4 ship with flag OFF; UI unchanged.
2. Verify backup shrink-guard passes after each migration.
3. Pilot: enable flag for one admin (Jaspal); create one Division-scope KPI; verify propagation, audit timeline, scorecard, report, backup snapshot.
4. Monitor `kpi_audit_logs` for 7 days; flip flag ON in production.
5. Phase 2 backlog: composite `scope_filters jsonb`; drop deprecated `pms_grade` / `level` text columns.

## Risk & Impact Snapshot

| Area | Risk | Mitigation |
|---|---|---|
| Data | Adding nullable FKs + enum widening across 3 tables | Additive-only; CHECK enforces exactly-one target |
| Workflow | ~20 RPCs branch on scope | Single resolver collapses to one branch point |
| RLS | New scope columns must be reachable | `has_scope_membership` SECURITY DEFINER, scalar-subselect wrapping |
| UI | New picker on 4 dialogs + 3 reports | Reusable `<ScopeTargetPicker>`; flag-gated |
| Regression | High blast radius | Feature flag default OFF; contract tests per scope; pilot user |
| Scalability | Level/Grade scope may resolve to >800 employees | Reuse chunked `propagate_org_kpi_value`; new FK indexes |
| Backup | New columns + new master FKs | Auto-covered by `get_backup_table_order()`; shrink-guard verifies count |
| Rollback | Multi-step migration | Each migration reversible; flag flip = soft rollback |

## Out of Scope (Phase 1)
- Composite scopes (Division + Location, etc.).
- Dropping deprecated `pms_grade` / `level` text columns on profiles.
- Incentive rules referencing extended scopes.
- Safety module.
- Auto-suggestion of scope.

---

**On approval I'll start with Step 1 (profile FK migration) and request migration approval before each DB step.**
