---
name: Dashboard KRA Add/Delete
description: Allowlist-gated Add/Delete KRA controls on Dashboard reusing AdminKpiCreateDialog and useAdminDeleteKpi
type: feature
---
- Workflow setting `dashboard_kra_management_roles` (JSON array, category=`validation`) controls who sees Add KRA / Delete KRA on the Dashboard. Default `["admin"]`.
- Admin is always allowed regardless of the list (safety net inside `useDashboardKraPermissions`).
- "Add KRA" button lives in `src/pages/Dashboard.tsx` for both self-view and reviewer-view (when an employee is selected). Opens existing `AdminKpiCreateDialog` pre-filled with the displayed employee + current period.
- "Delete KRA" button lives in `src/components/review/KpiHeaderSection.tsx` next to Step Back. Wrapped in `ConfirmDestructiveDialog` per `mem://design/destructive-action-governance`. Calls existing `useAdminDeleteKpi` (same path as Admin → All KPIs, so RLS + audit + cascade behavior is identical).
- Edit / Admin Data Entry / Step Back remain admin-only — only Delete is granted by the allowlist.
- No schema changes to `kpis`. Allowlist UI auto-renders in Workflow Settings via the existing `_roles` checkbox grid renderer in `WorkflowSettingsTab.tsx`.
