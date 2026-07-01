## Problem

In Edit User → Access & Login → **Workflow mapping**, assigning a workflow saves it only for the exact selected month (e.g. July 2026). August, September, and the next Jan-onward periods still fall back to the department / PMS-grade / global default instead of the workflow the admin just picked.

## Good news — the DB already supports "effective from"

`workflow_config.is_ongoing` (migration `20260316103740`) exists exactly for this purpose. The resolver `find_ongoing_workflow` / `get_employee_workflow_info` already checks: for the queried period, pick the most recent ongoing anchor at or before that period. So a single row with `is_ongoing = true` at July 2026 automatically applies to July, August, September, … forward.

Exact-month overrides still win (priority 1 in the resolver), so a future one-off change for a specific month remains possible.

## Fix (surgical, UI-only, one file)

`src/pages/admin/UserManagement.tsx` → `InlineWorkflowMappingCard`:

1. In `onChange`, pass `isOngoing: true` to `useUpsertWorkflowConfig` so the saved row becomes the "effective from {period} {year}" anchor.
2. Update the two helper lines so admins understand the new semantics:
   - Header sub-copy → "Applies from the selected month onward until a newer mapping is set."
   - Empty-state text → "No mapping effective for {period} {year} — currently inheriting the period default."
   - Success toast → "Workflow effective from {period} {year} onward."
3. "Reset this period" copy → "Clears the mapping starting at {period} {year}. Earlier months keep their previous mapping."

No changes to hook signature, DB schema, resolver, or other callers (the create-user path in the same file explicitly passes `is_ongoing: false` at line 798 and stays as-is — that's a different, global row).

## Risk & impact

- Data: additive — new rows saved with `is_ongoing = true`. No existing rows mutated.
- Workflow: exactly what the user asked for. Exact-month overrides still take precedence.
- Regression: none. Resolver logic is already in production and used by `WorkflowConfig.tsx` (bulk view already renders `is_ongoing` correctly).
- Rollback: revert the one file.

## Tests

Add a unit test asserting `InlineWorkflowMappingCard` calls `upsert.mutate` with `isOngoing: true` on select change.
