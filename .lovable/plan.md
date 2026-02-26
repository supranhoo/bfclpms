

# Confirmation: Auditor Mapping Already Restricted to Admin/Auditor Only

## Current State (Already Correct)

The auditor mapping badges (e.g., "-> Shekhar") are already restricted and NOT visible to employees. Here is how:

### Backend (Database Security)
- The `audit_kpi_level_assignments` table has RLS policies that only allow **admin** and **auditor** roles to SELECT data
- Employees cannot query this table at all -- the database will return zero rows

### Frontend (Rendering Guard)
- The `AuditKpiAssignPopover` component only renders when `viewType === 'audit'`
- The `useAuditKpiAssignments` hook only fetches data when `viewLevel === 'auditor'`
- The employee "My Dashboard" page does not import or use audit assignment data at all

### No Changes Needed

The previous plan (v1.46.29) proposed adding auditor badges to the employee's self-view Dashboard. Based on your clarification, that plan should be **abandoned** -- employees should NOT see auditor mapping.

The v1.46.28 fix (switching from `allKpis` to period-filtered `kpis` to avoid URL length limits) should resolve Shekhar's issue of not seeing the badges when logged in as an auditor. This fix is already implemented.

## Recommended Action

Please test the following to confirm everything works:
1. Log in as **Shekhar (auditor)** -- verify the auditor badge (e.g., "-> Shekhar") appears next to assigned KPIs in the Audit view
2. Log in as **Admin** -- verify auditor badges are visible in the Audit view
3. Log in as any **Employee** -- verify NO auditor mapping badges appear anywhere on their Dashboard

If Shekhar still cannot see badges after the v1.46.28 fix, the issue may be browser cache -- try a hard refresh (Ctrl+Shift+R).
