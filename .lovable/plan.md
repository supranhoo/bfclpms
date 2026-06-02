# Plan: New "Incentive" sidebar group

Add a dedicated, collapsible **INCENTIVE** group to the main sidebar and move the three incentive-related menu entries into it.

## Risk & Impact

- **Data:** None. Sidebar-only change — no routes, no DB, no RLS.
- **Workflow:** Same screens, new grouping. Existing menu-access keys (`admin-incentive`, `admin-incentive-data`, `reports-incentive`) are reused so role/profile permissions don't need to change.
- **Regression risk:** Low. Only `AppSidebar.tsx` is touched. The Data Entry shortcut for non-admin roles (which also points to Incentive Data Entry) is left untouched.
- **Mitigation:** Path-to-section helper updated so the new group highlights when any incentive route is active.

## UI Changes

**Before** (Administration + Reports):
```text
ADMINISTRATION
  % Incentive Config
  ⇥ Incentive Data Entry
  ⇥ Increment Inputs
  🎓 Employee Development

REPORTS
  📊 View Reports
  📊 Performance Report
  📄 KRA Issuance
  🎓 TNI Report
  % Incentive Report
```

**After:**
```text
KRA SETTINGS
  …

INCENTIVE                         ← NEW collapsible group
  % Incentive Config
  ⇥ Incentive Data Entry
  % Incentive Report

ADMINISTRATION
  …
  ⇥ Increment Inputs
  🎓 Employee Development

REPORTS
  📊 View Reports
  📊 Performance Report
  📄 KRA Issuance
  🎓 TNI Report
```

The new **INCENTIVE** group is placed **between KRA Settings and Administration**, which renders it visually **above Employee Development**. It behaves like any other group: collapsible chevron, pulse dot when collapsed but a child route is active, role-filtered items.

## Technical Changes

`src/components/layout/AppSidebar.tsx` only:

1. Add a new `incentive` array to the menu items factory:
   - `Incentive Config` — `/admin/incentive-config`, `menuKey: admin-incentive`, roles `['admin']`
   - `Incentive Data Entry` — `/admin/incentive-data-entry`, `menuKey: admin-incentive-data`, roles `['admin']`
   - `Incentive Report` — `/reports/incentive`, `menuKey: reports-incentive`, roles `['admin', 'management', 'hr_pms']`
2. Remove those three entries from `admin` and from `reports`. Leave the `dataEntry` group's `Incentive Data Entry` row untouched (it covers non-admin roles via a separate menu key).
3. Extend `getSectionForPath()`:
   - Return `'incentive'` for `/admin/incentive-config`, `/admin/incentive-data-entry`, `/reports/incentive`.
4. Add a `<CollapsibleSidebarGroup label="Incentive" items={menuItems.incentive} … />` between the existing **KRA Settings** and **Administration** groups, wired into `openSections`/`toggleSection` exactly like the others.

## Out of Scope

- No changes to routes, pages, components inside the Incentive screens.
- No changes to `menu_access_config` / DB.
- Employee Development, Increment Inputs stay in Administration.

## Files Touched

- `src/components/layout/AppSidebar.tsx`

## Rollback

Revert the single file.
