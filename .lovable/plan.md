

# Add Auditor Reassignment to Self-Dashboard KPI Table

## Problem
The "Reassign Auditor" popover (the "→ Shekhar" badge) currently only appears in the **Audit panel** view of KpiDetailsTable. When viewing the employee's own dashboard at `/dashboard`, the Status column only shows the status badge without any auditor assignment info or reassignment capability.

## Solution
Show the `AuditKpiAssignPopover` in the self-dashboard's KPI table (Status column) for users who have auditor or admin roles. This lets auditors/admins reassign KPIs to different auditors without switching to the Audit panel.

## Changes

### 1. `src/pages/Dashboard.tsx`
- Import `useAuditKpiAssignments` hook and `AuditKpiAssignPopover` component
- Fetch KPI-level audit assignments for the current user's KPIs (only when user has auditor/admin role)
- In the Status column (around line 833), render the `AuditKpiAssignPopover` below the status badge when the user has auditor/admin privileges
- In the `MobileKpiCard` section, pass audit assignment data so mobile users also see the auditor badge

### 2. `src/components/dashboard/MobileKpiCard.tsx`
- Accept an optional `auditAssignment` prop
- Render the `AuditKpiAssignPopover` next to the status badge when an assignment exists or user is an auditor/admin

## Technical Details

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Import hooks/components, fetch audit assignments, render popover in Status column |
| `src/components/dashboard/MobileKpiCard.tsx` | Add optional `auditAssignment` prop, render popover |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | None | Read-only query for non-auditor users; existing RLS policies apply |
| Regression | Low | Popover only renders for auditor/admin roles; self-review employees see no change |
| Performance | Low | Query only fires when user has auditor/admin role |

