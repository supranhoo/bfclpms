

# Fix: Auditor Assignment Badge Not Visible in Dashboard Audit View (v1.46.27)

## Root Cause

The dashboard uses `UnifiedScorecard` for all reviewer views (manager, auditor, HR PMS, management). However, `UnifiedScorecard` never imports `useAuditKpiAssignments` and never passes the `auditKpiAssignments` prop to `KpiDetailsTable`.

Inside `KpiDetailsTable`, the `AuditKpiAssignPopover` renders when `viewType === 'audit'`, but it receives `auditKpiAssignments?.get(kpi.id)` which is always `undefined` (since the prop is never provided). This means:
- The popover trigger shows the generic `UserPlus` icon button (no badge)
- `currentAssignment` is always `null`, so the auditor name badge never appears

The old `AuditScorecard` component correctly fetches and passes this data, but it is no longer used on the dashboard -- it was replaced by `UnifiedScorecard`.

## Solution

Add `useAuditKpiAssignments` to `UnifiedScorecard` so it fetches KPI-level audit assignments when the view is in audit mode, and passes them to `KpiDetailsTable`.

## Changes

### 1. `src/components/review/UnifiedScorecard.tsx`

- **Import** `useAuditKpiAssignments` from the hook file
- **Call the hook** conditionally when `viewLevel === 'auditor'`, passing the current KPI IDs
- **Pass** `auditKpiAssignments` prop to `KpiDetailsTable`

This is the same pattern already used in `AuditScorecard.tsx` (lines 52, 141, 774).

### 2. No other changes needed

- The hook (`useAuditKpiAssignments`) already uses a two-step fetch and works correctly
- The `KpiDetailsTable` already accepts and renders the `auditKpiAssignments` prop
- The `AuditKpiAssignPopover` already displays the badge when `currentAssignment` is non-null
- RLS policies already allow auditors and admins to SELECT from the table

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only query addition |
| Performance | Negligible | Hook is disabled when not in audit view; query only runs for auditors |
| Regression | None | Adds missing data flow; no existing behavior changes |
| Scope | 1 file, ~5 lines added | Minimal surface area |

