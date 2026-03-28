

## Fix: Employee Menu Overrides Not Working Due to Hardcoded Section Guards

### Root Cause
The sidebar has **hardcoded role checks** wrapping each section group that block rendering before `filterByRole`/`canAccess` ever runs.

For example, line 320:
```jsx
{effectiveRole === 'admin' && (
  <CollapsibleSidebarGroup label="Administration" items={menuItems.admin} ... />
)}
```

Employee 101715 has a user override for `admin-incentive` (Incentive Config), so `canAccess('admin-incentive')` returns `true`. But the entire Administration section is gated by `effectiveRole === 'admin'`, so non-admin users never see it — the override is ignored.

Same issue affects Manager, Management, HR PMS, Audit, and Reports sections.

### Fix
Replace all hardcoded section-level role guards with a check that asks: "does the current user have access to **any** item in this section?" This way, if a user has even one override in a section, the section renders.

The `CollapsibleSidebarGroup` already handles hiding itself when `filteredItems.length === 0`, so we just need to remove the outer guards or replace them with a pre-filter check.

**Approach**: Create a helper `hasAnyAccess(items)` that returns true if `canAccess` passes for at least one item. Replace each section guard with this check.

```text
Before:  {effectiveRole === 'admin' && (<CollapsibleSidebarGroup .../>)}
After:   <CollapsibleSidebarGroup ... />   (already self-hides when no items pass filter)
```

Since `CollapsibleSidebarGroup` already returns `null` when `filteredItems.length === 0`, the simplest fix is to **remove all the section-level conditionals** entirely. The `filterByRole` → `canAccess` pipeline already handles visibility correctly.

The only special case is the Data Entry section (`effectiveRole !== 'admin' && isDataOwner`) which has an `isDataOwner` check — this needs to also consider overrides.

### Files Changed
| File | Action |
|------|--------|
| `src/components/layout/AppSidebar.tsx` | Remove hardcoded section guards; let `CollapsibleSidebarGroup` self-filter via `canAccess` |

### Risk Assessment
- **Regression**: Zero — `canAccess` already enforces the correct role + override logic; removing redundant outer guards just unblocks it
- **Security**: No change — menu visibility is cosmetic; actual data access is controlled by RLS and route guards
- **Data**: No schema changes

