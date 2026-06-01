## Goal

In **Workflow Config → Configure Final Score Rule**, make the **Applied To** field dynamic and multi-selectable based on the chosen **Scope**, while preserving all existing rule storage, precedence, and resolution logic.

## Scope (frontend-only)

- File: `src/components/admin/FinalScoreRulesTab.tsx` (RuleBuilderSheet).
- Reuse existing patterns:
  - `EmployeeCombobox` (already supports multi-select, checkbox, chips, search by name/code/department).
  - `MultiSelectFilter` (checkbox-based multi-select with search) for Department and PMS Grade.
- Data sources (existing hooks, no new queries):
  - Employees: `useProfiles()` (already paged-correctly, filter `is_active`).
  - Departments: `useDepartments()` (already loaded; show `name` + parent BU).
  - PMS Grades: `usePmsGrades()` from `useOrganization`.
  - Workflow Templates: existing `useWorkflowTemplates()` — kept single-select (DB column `workflow_template_id` is one per row; admin can clone rule across templates via repeat save if needed — out of scope here).

## Storage model

The `workflow_final_score_rules` table stores **one row per (scope_type, scope_value, template, period)**. We will not change the schema. Multi-select in the UI simply creates/updates **N rows** in one save action — one per selected scope value — keyed by `(scope_type, scope_value, workflow_template_id, review_period, review_year)` so re-saves update in place and never overwrite unrelated scopes.

For **Edit existing rule**: the sheet still edits exactly that one row (Applied To remains single in edit mode). Multi-select is only available in **Create** mode, to avoid silently splitting/merging an existing record.

## UI behavior

### Applied To (Create mode)

| Scope | Component | Display | Search |
|---|---|---|---|
| Employee | `EmployeeCombobox multiple` | Name · Code · Department | name/code/department |
| Department | `MultiSelectFilter` | Name (+ BU subtitle if available) | name |
| PMS Grade | `MultiSelectFilter` | Grade name/code | name/code |
| Template | (hidden — Applied To = the selected Workflow Template) | — | — |

- Checkbox-based selection, Select All / Clear All, selected chips with remove (`X`), selected count badge.
- Changing Scope clears `scopeValues`.
- Required-field validation: if `scopeType !== 'template'` and `scopeValues.length === 0`, disable Save and show inline error `Please select at least one [employee/department/PMS grade].`

### Edit mode

- Applied To stays single-value (current behavior) — shown with the same component in single-select form so the admin can change the target if needed.

### Save flow

```text
Create + N selected values
  for each value in scopeValues:
    upsert({ scope_type, scope_value: value, workflow_template_id, ... })
Toast: "Final score rule applied to N selected items."

Edit
  upsert({ id, scope_type, scope_value, ... })  // unchanged
```

- Loop uses the existing `useUpsertFinalScoreRule` mutation (`Promise.all`). On partial failure, show per-item failure count in the toast and keep successful rows.

## Out of scope (unchanged)

- `finalScoreResolver`, `applyFinalScoreRule`, DB triggers, RLS, rule precedence (Employee > Department > PMS Grade > Template).
- Score calculation, historical scores, reports.
- DB schema (`workflow_final_score_rules` columns and unique key remain as-is).

## Risk & impact

- **Data**: additive only — N independent upserts; unique key prevents duplicates.
- **Workflow**: no change to resolution/precedence.
- **UI**: limited to RuleBuilderSheet; list view, filters, delete, and edit-of-existing-rule unchanged.
- **Regression**: low — single-select edit path is preserved; only Create mode changes from string → string[] in the dialog's local state.

## Test plan

- `bunx vitest` continues to pass.
- Unit test `FinalScoreRulesTab` (new lightweight test, or extend existing) — render Create sheet, switch each scope, verify the correct picker appears and Save invokes upsert N times with distinct `scope_value` values.

## Files to touch

- `src/components/admin/FinalScoreRulesTab.tsx` — replace Applied To block, add `usePmsGrades` + `useProfiles` imports, switch `scopeValue: string` → `scopeValues: string[]` (Create only), update `handleSave` to loop, add inline validation message.
- `.lovable/plan.md` — update with this scope.
- Memory: append note under `mem://features/admin/configurable-final-score-rules` that Applied To is multi-select in Create mode and single-value in Edit.

No DB migration. No changes to types, RPCs, resolver, or triggers.
