# Group KPI editor: real scope dropdown + data-owner selection

Two fixes in the Performance Console's group edit dialog (Advanced block).

## 1. Org-level scope becomes a dropdown

Today the field is a free-text box (`Input`, placeholder "e.g. organization, business_unit, department"), so a typo silently writes an invalid scope word.

It becomes:
- A **Select** listing the live scopes from the single scope vocabulary (Organization, Department, Employee, Business Unit, Location), with Division / PMS Grade / Level shown as disabled "Soon" entries — identical wording to the create dialog and the scope menu (ADR-319/320 SSOT, no scope words typed into this component).
- When the chosen scope needs a target ("which department / business unit / location / employee?"), the existing **ScopeTargetPicker** appears right under it, with its live reach line ("Applies to 214 active employees") and the empty-target warning.
- Turning the Organisation-level switch off clears the scope and target, as today.

## 2. Data owner selection moves into this dialog

Assigning who may enter the central value currently lives in a separate "Assign Data Owners" dialog. The same capability is added to the group editor as a **Data entry owners** field, visible only while the KPI is organisation-level:
- A searchable people combobox (name / email / employee code) with paged employee loading, plus the current owners listed as removable chips.
- Owners are attached to the KPI signature (category + KRA + KPI), not to a month — so they are written immediately on selection and are explicitly **not** part of the "Apply to" month span. The dialog states this in one line so nobody expects owners to roll forward per month.
- Reuses the existing owner assign / remove behaviour and its confirmation on removal; no new write path.

## Technical notes

- `GroupDefinitionEditDialog.tsx`: replace the scope `Input` with a scope `Select` + `ScopeTargetPicker`; add an owners section driven by the existing org-KPI owner hooks. `min-w-0` / `break-words` kept so the dialog still fits without horizontal scroll.
- Scope target columns (`business_unit_id`, `location_id`, `department_id`, `employee_id`, …) are not in the server whitelist `bu_console_editable_fields()` today, so a targeted scope cannot currently be written by a group edit. One migration adds them to the whitelist and validates in `bu_console_validate_changes` that a scope carries exactly its own target column and no other — the same rule as the `kpis` check constraint. A scope whose target has no active employees is refused with a plain message.
- Field labels for the new columns added to `GROUP_EDIT_FIELD_LABELS`; scope/target are scoring-affecting, so they stay outside the ADR-321 text-only allowance and continue to skip locked rows.
- Tests: scope→column mapping and validation cases for the new target fields; a render test that the scope dropdown offers only vocabulary values and that the owners section appears only for org-level KPIs.
- Docs: ADR-322 plus POLICY §KPI-SCOPE-SINGLE-VOCABULARY amendment (scope is never free text) and a DOCUMENTATION.md entry.

## Risk

- Data: additive — one whitelist/validation migration, no schema change, no historical row rewritten.
- Workflow: unchanged; owners control who enters values, never who approves.
- Regression: existing KPIs whose `org_level_scope` holds a legacy word are normalised for display only; the stored value is untouched until the user picks a new scope.
- Rollback: revert the function bodies and the component; written rows keep their columns.
