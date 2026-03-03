

# System Control: Lock Org KPI Self-Entry by Employees

## Problem
Currently, employees can enter achieved values for org-level KPIs in their Self Review sheet before a Data Owner has propagated data. The `hasOrgData` guard only locks the field **after** propagation — it doesn't prevent early entry. The business requirement is that org KPI data should **only** be entered by designated Data Owners (or admins), never by employees themselves.

## Design

Add a new **boolean system control** in `workflow_settings` called `org_kpi_employee_self_entry`. Default: `false` (locked). When `false`, employees cannot enter achieved values for any KPI flagged `is_org_level = true` in their self-review — the form shows a locked state with a message like "This is an Organization KPI. Data will be entered by the designated Data Owner."

When `true`, the current behavior is preserved (employees can enter data).

## Changes

### 1. Database: Insert new workflow setting
Insert one row into `workflow_settings`:
- `category`: `'validation'`
- `setting_key`: `'org_kpi_employee_self_entry'`
- `setting_value`: `false`
- `label`: `'Allow Employee Self-Entry for Org KPIs'`
- `description`: `'When disabled, employees cannot enter achieved values for Organization-level KPIs. Only designated Data Owners and Admins can enter data.'`

### 2. Hook: `useWorkflowSettings.ts`
Add a convenience hook `useOrgKpiSelfEntryAllowed()` that reads the setting and returns a boolean (default `false`).

### 3. UI Lock: `SelfReviewSheet.tsx`
- Import the new hook
- Compute `isOrgLocked = isSelectedKpiOrgLevel && !orgKpiSelfEntryAllowed`
- When `isOrgLocked`:
  - Show a locked card (similar to frequency lock) instead of the assessment form
  - Message: "This is an Organization KPI. Data will be entered by the designated Data Owner."
  - The employee can still view KPI details, history, and observations — just not edit

### 4. Admin UI: `WorkflowSettingsTab.tsx`
No change needed — the existing boolean switch renderer will automatically pick up the new `validation` category setting and display it as a toggle.

**1 DB insert (data, not schema), 2 file edits. No migration needed.**

