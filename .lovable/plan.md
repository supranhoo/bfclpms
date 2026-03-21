

## Revert HR PMS 7 Tiles + Add Dedicated Dashboard Views (IMPLEMENTED)

### What Changed
1. **Reverted HR PMS tiles** back to standard 5-tile pattern (Total Employees, Pending Review, In HR PMS Review, Reviewed, Total KPIs) — "Pending Review" now correctly shows only KPIs at stages before `hr_pms_review` (not the broad sum that was previously shown as 194)
2. **Added 3 new ViewMode tabs** visible to HR PMS / admin roles: "Self Review", "Manager Review", "Skip Mgr Review" — each showing only employees whose KPIs are pending at that specific workflow stage

### Files Modified
- `src/components/review/ViewModeToggle.tsx` — Added 3 new ViewMode values and config entries
- `src/pages/Dashboard.tsx` — Added new modes to availableModes for hr_pms/admin roles
- `src/components/review/EmployeeSelectorGrid.tsx` — Reverted HR PMS to 5-tile, added 3 new viewLevel handlers with stats, filters, badges, and data fetching
