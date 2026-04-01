

## Plan: Extract "Incentive Data Entry" as a Separate Menu Item

### Problem
Currently, Production Data and Eligibility Data are tabs inside Incentive Config. This means anyone who needs to do data entry must have access to the full configuration page (programs, slabs, DQ rules). Separation is needed for access control.

### Approach

**1. Create new page: `src/pages/admin/IncentiveDataEntry.tsx`**
- New standalone page with two tabs: "Production Data" and "Eligibility Data"
- Reuses existing components: `UnifiedProductionDataTab` and `EligibilityDataEntry`
- Fetches `programs` via `useIncentivePrograms()` (read-only usage for production data dropdown)
- PageHeader: "Incentive Data Entry" with appropriate description

**2. Update `src/pages/admin/IncentiveConfig.tsx`**
- Remove the "Production Data" and "Eligibility Data" tabs
- Keep only the "Programs" tab (can remove the Tabs wrapper entirely since it's now single-content)
- Update description to reflect config-only scope

**3. Add route in `src/App.tsx`**
- New route: `/admin/incentive-data-entry`
- ProtectedRoute with `menuKey: 'admin-incentive-data'`, `allowedRoles: ['admin']`

**4. Add sidebar menu item in `src/components/layout/AppSidebar.tsx`**
- New entry in `admin` group right after Incentive Config:
  ```
  { title: 'Incentive Data Entry', icon: FileInput, path: '/admin/incentive-data-entry',
    menuKey: 'admin-incentive-data', roles: ['admin'] }
  ```
- Also add to `dataEntry` group so non-admin users with menu overrides can access it

**5. Seed menu_access_config**
- SQL migration to insert `admin-incentive-data` into `menu_access_config` so it appears in Menu Access Rights for role-based + user-level override assignment

**6. Update `DOCUMENTATION.md` and `POLICY.md`**

### Additional Ideas

- **Read-only program list for data entry**: The data entry page only needs to read program names for dropdowns — no mutation access to programs/slabs/DQ rules. This naturally enforces separation.
- **Future: Dedicated data-entry roles**: With the menu access override system already in place, admins can immediately grant "Incentive Data Entry" to specific employees (e.g., accounts team) without giving them Incentive Config access.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/admin/IncentiveDataEntry.tsx` | New page with Production Data + Eligibility Data tabs |
| `src/pages/admin/IncentiveConfig.tsx` | Remove Production/Eligibility tabs, keep Programs only |
| `src/App.tsx` | Add route for `/admin/incentive-data-entry` |
| `src/components/layout/AppSidebar.tsx` | Add menu item in admin + dataEntry groups |
| SQL migration | Seed `menu_access_config` for new menuKey |
| `DOCUMENTATION.md` | v2.15.48 |

### Risk Assessment
- **Regression**: Low — existing components (`UnifiedProductionDataTab`, `EligibilityDataEntry`) are simply moved to a new host page, no logic changes
- **Access**: Existing Incentive Config users see no disruption; data entry is now independently grantable
- **Data**: No schema changes to business tables

