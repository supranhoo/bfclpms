

# Report Access Control System (with User-Level Overrides)

## Overview
Build an admin-configurable Report Access Control system with **two layers of permissions**:
1. **Role-based access** -- define which roles can view/download each report (e.g., all managers can view Performance Report)
2. **User-level overrides** -- grant specific individual users access to view/download specific reports, regardless of their role (e.g., give "Ramesh" full access to the Employee Performance Summary even though he is an employee)

## Database Design

### Table 1: `report_access_config` (Role-based rules)
Stores per-report role permissions.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| report_key | text (unique) | e.g. `employee-summary` |
| report_name | text | Display name |
| view_roles | app_role[] | Roles allowed to view |
| download_roles | app_role[] | Roles allowed to download/export |
| created_at | timestamptz | Auto |
| updated_at | timestamptz | Auto |

### Table 2: `report_access_user_overrides` (Individual user grants)
Stores per-user, per-report access grants. This is how you give a specific person access to a report they wouldn't normally see based on their role.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| report_key | text | References the report |
| user_id | uuid | The specific user granted access |
| can_view | boolean | Whether this user can view the report (default true) |
| can_download | boolean | Whether this user can download/export (default false) |
| granted_by | uuid | Admin who granted access |
| created_at | timestamptz | Auto |
| unique(report_key, user_id) | | Prevent duplicate grants |

### RLS Policies
- Both tables: All authenticated users can SELECT (needed for permission checks)
- Both tables: Only admins can INSERT/UPDATE/DELETE

### Permission Logic
Access is granted if **either** condition is met:
- The user's role is in the report's `view_roles` / `download_roles` array, **OR**
- The user has an entry in `report_access_user_overrides` with `can_view = true` / `can_download = true`

## New Files

### `src/hooks/useReportAccess.ts`
Hook that fetches both tables and provides:
- `canView(reportKey)` -- checks role-based config OR user override
- `canDownload(reportKey)` -- checks role-based config OR user override
- `configs` -- all report configs for admin UI
- `userOverrides` -- all user overrides for admin UI
- `updateAccess(reportKey, viewRoles, downloadRoles)` -- mutation for role config
- `grantUserAccess(reportKey, userId, canView, canDownload)` -- mutation for user override
- `revokeUserAccess(reportKey, userId)` -- mutation to remove user override

### `src/components/admin/ReportAccessTab.tsx`
Admin UI with two sections:

**Section 1 -- Role-Based Access (table)**
- Lists all 12 reports
- Per report: multi-select chips for View Roles and Download Roles
- Save button

**Section 2 -- User-Level Overrides**
- A searchable employee selector (similar to existing employee selectors in the app)
- Select a report from dropdown
- Toggle "Can View" and "Can Download"
- Shows current user overrides in a table with ability to revoke
- Example: Admin searches "Ramesh", selects "Employee Performance Summary", toggles "Can View" and "Can Download" on, clicks Grant

### `src/components/layout/ReportRoute.tsx`
Dynamic route guard that reads DB config instead of hardcoded roles. Checks both role-based and user-level access.

## Modified Files

### `src/pages/admin/SystemSettings.tsx`
- Add a "Reports" tab (with a `Shield` icon) to the existing tabs
- Renders `ReportAccessTab`

### `src/pages/reports/ReportsHub.tsx`
- Use `useReportAccess` to filter which report cards are visible
- Reports the user cannot view (by role OR user override) are hidden

### `src/App.tsx`
- Replace hardcoded `ProtectedRoute` on report routes with the new `ReportRoute` wrapper that reads permissions from the database

### 12 Individual Report Pages
- Wrap each "Export Excel" / "Export PDF" button with `canDownload` check
- If user cannot download, hide the button or show it disabled with a tooltip

## Seed Data
All 12 reports seeded with current hardcoded role defaults. Download defaults to admin-only. No user overrides initially (empty table).

| Report | View Roles | Download Roles |
|--------|-----------|---------------|
| Employee Performance Summary | manager, admin, auditor, management | admin |
| Performance Report | manager, admin, auditor, management | admin |
| Monthly Scorecard | manager, admin, auditor, management | admin |
| KRA Issuance | manager, admin, management | admin |
| Query Report | manager, admin, auditor, management | admin |
| Issues Report | manager, admin, auditor, management | admin |
| Completion Report | manager, admin, management | admin |
| Department Summary | manager, admin, management | admin |
| Audit Trail | admin, auditor | admin |
| TNI Report | manager, admin, management | admin |
| KPI Detail Report | manager, admin, auditor, management, hr_pms | admin |
| Bottleneck Report | admin, auditor, management | admin |

## How the User-Level Override Works (Example)

**Scenario**: Admin wants to give employee "Ramesh Kumar" full access to view and download the "Employee Performance Summary" report.

1. Admin goes to **System Settings -> Reports** tab
2. Scrolls to "User-Level Overrides" section
3. Searches for "Ramesh Kumar" in the employee search
4. Selects report: "Employee Performance Summary"
5. Toggles: Can View = ON, Can Download = ON
6. Clicks "Grant Access"
7. Ramesh can now see the report in Reports Hub and download it, even though his role (employee) is not in the role-based config

**To revoke**: Admin finds the override in the table and clicks "Revoke".

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data impact | Two new tables only, no changes to existing tables | Seed matches current defaults |
| Regression | Low -- fallback to current hardcoded roles if no DB config found | Hook returns defaults when table is empty |
| Security | RLS ensures only admins can modify configs | SELECT open for permission checks |
| Performance | Two small tables cached by React Query (5-min stale time) | Negligible overhead |
| Privilege escalation | User overrides are admin-controlled, not self-service | RLS + admin-only INSERT/UPDATE/DELETE |

