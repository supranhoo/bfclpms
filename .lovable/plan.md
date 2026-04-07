

## RCA: Incentive Report Redirecting to Dashboard

### Root Cause
The system has **two independent access control layers** that are not synchronized:

1. **Menu Access** (sidebar visibility) — `menu_access_config` + `menu_access_user_overrides`
2. **Report Access** (route guard) — `report_access_config` + `report_access_user_overrides`

The admin granted user 101715 (Jitendra Bharti, role: Manager) an override in the **Menu Access** system for "Incentive Report" — so the sidebar link is visible. However, the **route** `/reports/incentive` is wrapped in `<ReportRoute reportKey="incentive">`, which checks the **Report Access** system. The `incentive` report's `view_roles` are `[admin, management, hr_pms]` — Manager is not included, and no user-level override exists in `report_access_user_overrides`. So `ReportRoute` returns `<Navigate to="/dashboard" />`.

```text
User clicks "Incentive Report" in sidebar
  → Sidebar visible? YES (menu_access_user_overrides has entry) ✓
  → Route allowed?  NO  (report_access_user_overrides has NO entry) ✗
  → ReportRoute redirects to /dashboard
```

### Fix: Sync Menu Overrides into Report Route Checks

When a menu override exists for a report-type menu item, the `ReportRoute` guard should also honor it. This avoids forcing admins to configure the same override in two places.

**Approach**: Modify `ReportRoute` to also check `useMenuAccess().canAccess()` as a fallback. If the menu key maps to a report key, grant route access.

### Implementation

**1. Create a menu-key → report-key mapping**

Report menu items in the sidebar already have a `menuKey` (e.g., `incentive-report`). The `ReportRoute` uses a `reportKey` (e.g., `incentive`). We need a simple lookup.

**2. Update `src/components/layout/ReportRoute.tsx`**

Add a fallback check: if `canView(reportKey)` is false, also check `useMenuAccess().canAccess(correspondingMenuKey)`. If either passes, allow access.

```typescript
// Pseudocode
const menuKeyForReport = REPORT_TO_MENU_MAP[reportKey];
if (!canView(reportKey) && !(menuKeyForReport && canAccessMenu(menuKeyForReport))) {
  return <Navigate to="/dashboard" />;
}
```

**3. Determine the menu key mapping**

Need to check the sidebar config to find the exact menu keys used for report items.

### Files to Change

| File | Change |
|------|--------|
| `src/components/layout/ReportRoute.tsx` | Add `useMenuAccess` fallback check |
| `DOCUMENTATION.md` | Version bump, document the sync logic |

### Risk Assessment
- **Data Impact**: None — read-only check addition
- **Workflow Impact**: Positive — admins no longer need to configure two systems for the same access
- **Regression Risk**: Low — additive fallback; existing `canView` logic unchanged
- **Security**: Safe — only grants access if an explicit override exists in either system

