# Why Reports section is hidden for HR PMS

## Root cause
In `src/components/layout/AppSidebar.tsx` (lines 129–134), every item in the `reports` group has a static `roles` allowlist that omits `hr_pms`:

```
View Reports         → ['admin', 'manager', 'auditor', 'management']
Performance Report   → ['admin', 'manager', 'auditor']
KRA Issuance         → ['admin', 'manager', 'auditor']
TNI Report           → ['admin', 'manager', 'auditor']
```

The group renders through `CollapsibleSidebarGroup`, which hides itself when the filtered item list is empty. So an HR PMS user gets zero items and the whole "Reports" group disappears from the sidebar. (Page-level access via `report_access_config` still works if HR PMS navigates directly by URL, but the menu never surfaces it.)

Note: `Incentive Report` is in the `incentive` group (line 112) and already includes `hr_pms` — that's why HR PMS sees the incentive report but not the general Reports section.

## Fix (UI-only, surgical)
Add `'hr_pms'` to the `roles` array of the four items in the `reports` group in `src/components/layout/AppSidebar.tsx`:

- `View Reports` → add `hr_pms`
- `Performance Report` → add `hr_pms`
- `KRA Issuance` → add `hr_pms`
- `TNI Report` → add `hr_pms`

No changes to page-level RLS, `report_access_config`, or reporting services — HR PMS is already granted at those layers per existing policy; this only unhides the menu.

## Risk & impact
- Data impact: none.
- Workflow impact: none.
- UI impact: HR PMS users will now see the "Reports" collapsible group with the four entries above.
- Regression risk: minimal — additive role entry, same pattern used by `Incentive Report`.

## Rollback
Revert the four `roles` array edits.

## Confirm before I build
Should HR PMS get all four items (View Reports, Performance Report, KRA Issuance, TNI Report), or only a subset? Default in this plan: all four.
