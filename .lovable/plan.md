## Problem

In Edit User → Access & Login, the "Workflow mapping" card only inspects `workflow_config` rows that match the *exact* selected period+year for that employee. If the effective mapping comes from an earlier month's row, a department/grade rule, or the period default, the card falsely shows "Inherit period default" with no indication of what will actually apply. It also does not refresh cleanly after saves, so admins cannot trust the displayed state.

## Goal

Make the Workflow mapping card in `InlineWorkflowMappingCard` (`src/pages/admin/UserManagement.tsx`) show the true resolved mapping for the selected (employee, month, year), label its source, and stay in sync with every save/reset.

## Risk & Impact Report

- **Data**: Read-only additions — uses the existing `get_employee_workflow_info` RPC (SSOT per `mem://architecture/per-employee-workflow-resolution`). No schema, RLS, or trigger changes.
- **Workflow**: No change to seeding, reconciliation, or resolver behavior. Only the display and one cache invalidation call.
- **UI/UX**: Same card layout; adds a status line + subtle badge for the resolved template and its source (Employee override / Department / PMS Grade / Global default). Preserves the existing Select for overrides and the "Reset this period" button.
- **Regression**: Low. The Select's `value` still binds to the exact-period employee override, so save/reset semantics are unchanged. `useEmployeeWorkflow` is already used elsewhere and its query key is invalidated by `useUpsertWorkflowConfig` / `useDeleteWorkflowConfig`.
- **Scalability**: One extra RPC per open card (cached by React Query key `['employee-workflow', id, period, year]`).
- **Mitigation**: Add a unit test that asserts the resolution/label logic and a smoke test for the "no override, inherits from grade" case.

## Plan

1. **UI accuracy (`src/pages/admin/UserManagement.tsx` → `InlineWorkflowMappingCard`)**
   - Call `useEmployeeWorkflow(employeeId, period, year)` alongside the existing `useWorkflowConfigs` lookup.
   - Compute a `resolved` view-model:
     - `template` = `useEmployeeWorkflow` result (name, stages)
     - `source` = one of `employee_exact`, `employee_earlier_month`, `department`, `pms_grade`, `default`
     - `effectiveFrom` = for `employee_earlier_month`, the month/year of the most recent employee-typed row at or before (period, year), read from the existing `configs` list.
   - Render, above the Select:
     - "Effective for {Month YYYY}: **{template.display_name}**"
     - Source chip: "Set for this month" / "Carried from {Month YYYY}" / "Department default" / "PMS grade default" / "Global default".
     - Stage chips derived from `template.stages` (replaces the current stage-chip block so they always match what is effective, not just the exact-period override).
   - Replace the misleading "No mapping effective for {period} {year} — currently inheriting the period default." line with the resolved source description above.
   - Keep the Select bound to the exact-period `existing?.workflow_template_id`; placeholder becomes "Add override for {Month YYYY}" when no exact-period row exists.
   - Keep "Reset this period" button behavior unchanged (only clears the exact-period override).

2. **Freshness on save/reset**
   - After `upsert.mutate` / `remove.mutate` succeed, additionally invalidate `['employee-workflow', employeeId]` and `['employee-workflow-stages', employeeId]` at the card level to guarantee immediate re-render (the hook already invalidates globally; this is a belt-and-braces call scoped to the open dialog).

3. **Tests (`src/test/inlineWorkflowMappingCard.test.ts` — new)**
   - Pure helper `resolveInlineMapping({ configs, resolved, period, year, employeeId })` extracted from the component; assert:
     - exact-period employee row → `source: 'employee_exact'`
     - only an earlier employee row exists → `source: 'employee_earlier_month'` with correct `effectiveFrom`
     - no employee rows, RPC returns `config_source: 'department'` → source chip = "Department default"
     - same for `'pms_grade'` and `'default'`

4. **Docs & policy**
   - `DOCUMENTATION.md` — append version entry: "Edit User → Workflow mapping card now resolves via `get_employee_workflow_info` and labels the effective source."
   - `POLICY.md` — under the workflow-mapping section, add: "Any admin surface that shows an employee's workflow mapping MUST display the resolved template and source (employee/department/grade/default), never just the exact-period override."

## Technical Notes

- No changes to `useWorkflowConfig.ts`, RPCs, or `workflow_config` schema.
- The helper is exported for test coverage; the card renders it as pure props.
- Wording stays neutral and matches existing card typography; icons reused from `lucide-react` (`GitBranch`, `Info`).
