# Performance Console — map employees when creating a KPI, and add people to an existing KPI

## What is missing today

1. **New KPI dialog** issues the KPI to an entire scope (Individual / Organization / Department / Employee / Business Unit / Location) with no way to pick a specific set of people before committing. There is no employee multi-select and no editable recipient list.
2. **KPI detail drawer** exposes Enter value / Group approve / Edit definition / Tune, but no "Add employees" action — the mapped-employee list is read-only, so a person who joins later can never be attached to that KPI.

## What gets added

### 1. Recipient picking in the New KPI dialog
- Keep the scope cards as the reach selector, then add a **Recipients** step below the target picker:
  - Preview shows the resolved head count (already computed by the dry-run) as an expandable list of employees.
  - Each row can be unchecked to exclude that person from the issue run.
  - A search box allows adding an employee who is outside the resolved scope (explicit inclusion).
- Commit sends the final `employee_ids[]` (inclusions/exclusions applied) instead of relying purely on scope expansion.
- The scope + target still drive the default set, so nothing changes for the common "issue to everyone" case.

### 2. "Add employees" on an existing KPI
- New action in the KPI detail drawer header, next to *Tune several employees*.
- Dialog: searchable multi-select of active employees not yet mapped to that KPI for the open period, with department/manager/BU filters (reusing the console's cascading filter components).
- Preview first (head count + duplicate skips), then commit — same dry-run-then-write contract as every other console run.
- New rows inherit the KPI's current definition and scoring profile; per-employee target/bands stay adjustable afterwards via **Tune**.
- An "Apply to: this month only / this and all future months" control matches the group-edit span behaviour.

### 3. Guardrails
- Duplicate mapping for the same (employee, KPI, period) comes back as a `duplicate_kpi` skip, never an error.
- Locked/approved periods are skipped with a visible lock reason, consistent with the mixed-edit partitioning rules.
- Every add run writes one `bu_console_edit_runs` row so it is auditable and undoable like other console runs.

## Technical notes
- Extend `bu_console_kpi_create` to accept an optional explicit `employee_ids[]` that overrides/refines the scope expansion (dry-run path unchanged).
- New SECURITY DEFINER RPC `bu_console_kpi_add_employees(kpi_key, period, employee_ids[], span)` reusing the existing insert + run-logging path; access via `bu_console_can_write`.
- UI: `ConsoleKpiCreateDialog.tsx` gains a recipients section; new `KpiAddEmployeesDialog.tsx`; wire the action into `KpiDetailDrawer.tsx` and a mutation into `useBuConsole.ts`.
- Tests: model tests for recipient resolution (scope set ± manual include/exclude) and for duplicate/lock skip classification.
- Docs: ADR-329 and POLICY §CONSOLE-KPI-MEMBERSHIP; DOCUMENTATION.md version note in the same change.

## Rollback
Both RPCs are additive; the UI additions are removable without touching existing write paths.
