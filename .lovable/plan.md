

# CAPA: Add Skip-Level and HR PMS Sidebar Navigation

## Root Cause Analysis (RCA)

The skip-level review functionality was added to the Dashboard's ViewModeToggle and EmployeeSelectorGrid, but no sidebar navigation entries were created for it. Jaspal can only access skip-level review by going to "My Dashboard" and finding the small toggle button at the top -- there is no dedicated "Skip-Level Review" menu item like there is for "Team Review" or "Audit Panel".

Additionally, the `hr_pms` role is missing from the "My Dashboard" sidebar roles list, which would prevent HR PMS users from accessing the dashboard entirely.

## Corrective Actions (CAPA)

### File: `src/components/layout/AppSidebar.tsx`

1. **Add `hr_pms` role to the "My Dashboard" menu item** -- so HR PMS users can access the dashboard
2. **Add a "Skip-Level Review" sidebar entry** in the `manager` section pointing to `/dashboard?view=skip_level`, visible to managers and admins
3. **Add an "HR PMS Review" sidebar entry** in a new or existing section pointing to `/dashboard?view=hr_pms`, visible to `hr_pms` and `admin` roles
4. **Update `getSectionForPath` helper** to handle `view=skip_level` and `view=hr_pms` URL params for proper sidebar highlighting

### File: `DOCUMENTATION.md`

Update to document the new sidebar navigation entries.

## Technical Details

Changes to the `menuItems` object:

```text
main section:
  "My Dashboard" roles: add 'hr_pms'

manager section:
  Add: { title: 'Skip-Level Review', icon: UserCheck, path: '/dashboard?view=skip_level', roles: ['manager', 'admin'] }

New hr_pms section (or add to existing):
  Add: { title: 'HR PMS Review', icon: ClipboardCheck, path: '/dashboard?view=hr_pms', roles: ['hr_pms', 'admin'] }
```

Changes to `getSectionForPath`:
```text
Add: if (fullPath.includes('view=skip_level')) return 'manager';
Add: if (fullPath.includes('view=hr_pms')) return 'hr_pms';  (or appropriate section)
```

## Files to Modify

| File | Change |
|---|---|
| `src/components/layout/AppSidebar.tsx` | Add sidebar entries for Skip-Level and HR PMS review, update roles |
| `DOCUMENTATION.md` | Document new sidebar navigation items |

