## Goal

Introduce **Functional Manager** as a first-class reviewer/role across PMS — peer to Reporting Manager, Skip-Level, HR PMS, Auditor, Management. Optional per employee, optional per workflow template, fully backward compatible.

## Assumptions

1. Functional Manager is a **per-employee relationship** (stored on `profiles`), not a global role pool like HR PMS/Auditor/Management.
2. Resolver semantics mirror `manager` stage: `functional_manager_id` → resolve to a single user; if missing and stage is in template → flag as exception (`no_functional_manager_on_profile`).
3. A Functional Manager does **not** get `manager` app_role automatically — they review only employees mapped to them, only on the `functional_manager_check` stage.
4. Workflow ordering: `self_review → manager_check → functional_manager_check → skip_level_check → hr_pms_review → audit → management_review → approved`. Functional Manager sits **after** L1 Manager (configurable, default order).
5. No data migration required for existing rows — column is nullable.

## Risk & Impact Report

**Data Impact**
- New nullable column `profiles.functional_manager_id uuid` + FK + index. Non-destructive.
- New workflow stage enum value `functional_manager_check` added to whatever enum/text list drives `kpi_status` / workflow templates. (Need to confirm: stages stored as text array in `workflow_templates.stages` — additive, no enum mutation.)
- Backup engine: auto-covered (`get_backup_table_order` discovers `public.profiles` already). No changes needed.

**Workflow Impact**
- `workflowResolver.ts` (SSOT) gains a `functional_manager` ChainStage between `manager` and `skip_level`.
- `STAGE_TO_CHAIN`, `CHAIN_STAGES`, `CHAIN_STAGE_LABEL`, `NA_REASON_LABEL` extended.
- `workflowEngine.ts` stage transitions, `bottleneckResolver.ts`, `useKpis.ts` status filtering, RLS policies on `kpi_submissions`/`kpi_observations`/`kpi_queries` need to permit FM access analogous to manager.
- Existing templates that don't list `functional_manager_check` → skipped cleanly (stage not in template → `inTemplate=false`, no exception).

**UI/UX Impact**
- Add User & Edit User: new Reporting & Hierarchy field using existing `ManagerCombobox`.
- WorkflowConfig template builder: new selectable stage chip.
- Reports (Employee Master, Workflow Resolution, KPI Matrix, Performance, Manager Team) gain optional FM column + filter.
- Profile page (ReportingStructureCard) shows Functional Manager line when present.
- Bulk Review (`useBulkReview`, `EmployeeSelectorGrid`) gains FM scope.

**Regression Risk**
- Medium. Anywhere the code does `if (stage === 'manager_check')` branching is a candidate site. Mitigated by routing through SSOT helpers (`workflowResolver`, `reviewConstants.statusColors/Labels`) and adding stage to those maps in one place.
- Resolver chain order change could affect Workflow Resolution Report column order — additive append between manager and skip_level keeps existing column positions stable except the new column.

**Scalability**
- Single uuid column + one index. No query cost change.
- Workflow resolution adds one more stage iteration — O(1) per employee, negligible.

**Mitigation**
- All stage metadata centralized: `lib/reviewConstants.ts`, `lib/workflowResolver.ts`, `lib/employeeMasterFields.ts`.
- Feature is purely additive — old templates, old imports, old reports work unchanged.
- Comprehensive vitest coverage for resolver + import parser + workflow engine transition.

## Step-by-Step Plan

### Phase 1 — Schema & SSOT (DB migration)

```text
profiles
  + functional_manager_id uuid NULL
  + FK profiles_functional_manager_fkey → profiles(id) ON DELETE SET NULL
  + INDEX idx_profiles_functional_manager_id
```

- No enum changes (workflow stages live in `workflow_templates.stages text[]`).
- RLS additive policy on `kpi_submissions`, `kpi_observations`, `kpi_queries`, `kra_submissions` (whichever apply): "Functional Manager can SELECT/UPDATE when `auth.uid() = (SELECT functional_manager_id FROM profiles WHERE id = employee_id) AND status IN ('functional_manager_check'...)`". Mirrors existing manager policies.
- `has_functional_manager_access(employee_id uuid)` SECURITY DEFINER helper to avoid RLS recursion (mirrors `has_role` pattern from Core memory).

### Phase 2 — Resolver & engine

Files: `src/lib/workflowResolver.ts`, `src/lib/workflowEngine.ts`, `src/lib/bottleneckResolver.ts`, `src/lib/reviewConstants.ts`, `src/lib/inboxUtils.ts`, `src/lib/multimonthCycle.ts`.

- Add `functional_manager` to `ChainStage` union, `CHAIN_STAGES`, labels.
- `STAGE_TO_CHAIN['functional_manager_check'] = 'functional_manager'`.
- New `NaReason: 'no_functional_manager_on_profile'`.
- `resolveStageUser('functional_manager', …)` reads `employee.functional_manager_id`, returns user or NaReason. Add `functional_manager_id` to `ResolverProfile`.
- `statusColors`, `statusLabels`, `workflowEngine` stage order arrays add new stage between `manager_check` and `skip_level_check`.

### Phase 3 — Employee Master / Add & Edit User

Files: `src/pages/admin/UserManagement.tsx`, `src/lib/employeeMasterFields.ts` (+ test), `src/components/admin/ManagerCombobox.tsx` (reused as-is).

- Extend `EmployeeMasterFieldKey` with `functional_manager_id`; add definition; bump test from 19 → 20 fields.
- Add New User: in Reporting section, new ManagerCombobox row "Functional Manager" with `excludeId = newId` (none); persist to `profiles.functional_manager_id` post-create.
- Edit User: load + show + save selected FM; mirror existing reporting_manager_id flow.
- Validation: respect `DEFAULT_REQUIREMENTS` toggle (optional unless admin marks mandatory).

### Phase 4 — Import / Export

Files: `src/pages/admin/ImportData.tsx`, employee export helper, edge fn `create-employee` and `backfill-employee-master` if needed.

- Import: accept headers `functional_manager`, `functional_manager_code`, `functional_manager_employee_code`. Resolution priority = employee_code, then full_name fallback only if reporting_manager already uses that pattern.
- Invalid code → row-level error (not silent), surface in import results panel; row still inserts other fields if existing parser does partial commit, else skips with reason "Functional Manager code <X> not found".
- Export: add columns "Functional Manager Name", "Functional Manager Employee Code". Round-trip safe.
- Template download updated to include the new optional column.

### Phase 5 — Workflow Config

Files: `src/pages/admin/WorkflowConfig.tsx`, `src/components/admin/CustomWorkflowDialog.tsx`, `src/components/admin/WorkflowConfigExport.tsx`.

- Add `functional_manager_check` to selectable stages list.
- Default position: after `manager_check`. Admin can reorder/remove.
- Workflow Resolution export gets new "Functional Manager" column.
- Warning banner when a template includes `functional_manager_check` and any in-scope employee lacks an FM mapping (links to filtered employee list).

### Phase 6 — Review surfaces

Files: `src/components/review/*`, `src/hooks/useKpis.ts`, `src/hooks/useBulkReview.ts`, `src/hooks/usePendingSelfReviews.ts`, `src/hooks/useWorkflowResolution.ts`, `src/components/profile/ReportingStructureCard.tsx`.

- Scorecard, KpiJourneySection, WorkflowProgressTracker render the new stage badge/cell.
- `useBulkReview` recognizes `functional_manager_check` and scopes employee list to `functional_manager_id = auth.uid()`.
- Inbox / pending queues route FM-stage items to the FM user.
- Profile reporting card shows "Functional Manager" line.

### Phase 7 — Reports & Filters

Files: `src/pages/reports/*`, `src/components/reports/*`, `src/hooks/useEmployeeFilterOptions.ts`, `src/hooks/useKpiFilters.ts`.

- Employee Performance Summary, Manager Team KPI, KPI Matrix, Workflow Resolution, Custom Report builder: expose `functional_manager_id` as filterable field + optional column.
- "Group by Functional Manager" option where existing report has groupBy.

### Phase 8 — Permissions

- No new app_role enum. FM access derives from the `profiles.functional_manager_id` pointer + workflow stage = `functional_manager_check`, enforced by `has_functional_manager_access()` SECURITY DEFINER helper in RLS.
- Menu access unchanged: FM users keep their existing role(s); the FM "Review queue" surfaces inside existing Bulk Review / Pending Reviews when they have at least one mapped employee.

### Phase 9 — Tests & Docs

- `workflowResolver.test.ts`: chain ordering, NaReason for missing FM, skip when not in template.
- `employeeMasterFields.test.ts`: field count + new key.
- `bulkEmployeeFilter.test.ts`: FM-scoped employee filter.
- New `importEmployees.functionalManager.test.ts`: header aliases, invalid code error.
- Update `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`, add `docs/adr/ADR-071.md` (Functional Manager as peer reviewer level).
- New memory file `mem/features/admin/functional-manager-reviewer` + index entry.

## UI Changes (visible)

| Surface | Change |
|---|---|
| Add User → Personal/Reporting section | New "Functional Manager" combobox below Reporting Manager |
| Edit User → same | Same field, hydrated |
| Employee Master Fields settings | New row to mark FM mandatory |
| Import Data → Employees | New optional column in template + import preview |
| Export Employees | Two new columns |
| Workflow Config → Template builder | New stage chip "Functional Manager Review" |
| Workflow Resolution Report | New "Functional Manager" column |
| Profile → Reporting Structure card | New "Functional Manager" line when set |
| KPI Journey / Scorecard / Progress Tracker | New stage pill |
| Bulk Review | FM users see their mapped employees on FM stage |
| Reports (Employee, KPI Matrix, Performance, Custom) | Filter + optional column |

## Rollback Strategy

- Schema additive only → safe to drop column / FK / index in a reverse migration.
- Templates that adopted `functional_manager_check` would need that stage removed from `stages[]` before column drop (one-line UPDATE).
- All UI surfaces guarded by `if (functional_manager_id)` / `if (stages.includes('functional_manager_check'))` so removal degrades to current behavior.

## Out of Scope

- Multi-FM per employee (matrix orgs with >1 functional manager). If needed later, promote to junction table `employee_functional_managers`.
- Auto-assigning FM by department/grade.
- Email reminder customization specific to FM (uses existing per-stage reminder engine).

## Implementation Order (build mode)

1. Migration (Phase 1)
2. SSOT + resolver + engine + tests (Phase 2, 9 partial)
3. Add/Edit User + master fields (Phase 3)
4. Workflow Config UI (Phase 5)
5. Review surfaces + Bulk Review + RLS helper (Phase 6, 8)
6. Import/Export (Phase 4)
7. Reports & filters (Phase 7)
8. Docs, ADR, memory, changelog (Phase 9 final)

Each phase is independently shippable behind the additive schema.
