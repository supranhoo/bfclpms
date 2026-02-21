

# Fix: N/A Toggle Missing for Department and Employee Scoped Org KPIs

## Problem

The "Mark as Not Applicable (N/A)" toggle on the Org KPI Data Entry cards is only visible for **Organization** scoped KPIs. Department and Employee scoped KPIs do not show the toggle, preventing admins from marking them as N/A.

## Root Cause

In `OrgKpiEntryCard.tsx`, three conditional blocks explicitly check `data.scope === 'organization'`, excluding department and employee scopes:

- **Line 288**: N/A toggle — only rendered for `organization` scope
- **Line 306**: Input area (hidden when N/A) — only for `organization` scope
- **Line 348**: N/A explanation view — only for `organization` scope

## Fix

Remove the `data.scope === 'organization'` restriction from these three sections so the N/A toggle and N/A view are available for all scope types. When N/A is toggled on for a department/employee scoped KPI, the scoped entry table should also be hidden (since all values become irrelevant).

### Files to Modify

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiEntryCard.tsx` | Remove scope restriction from N/A toggle (line 288), input area (line 306), and N/A view (line 348). Hide scoped entry table when N/A is active (line 614). |
| `DOCUMENTATION.md` | Version bump to 1.45.52 |

### Detailed Changes in OrgKpiEntryCard.tsx

1. **Line 288** — N/A toggle: Change `isAdmin && data.scope === 'organization' && !isLocked` to `isAdmin && !isLocked`
2. **Line 306** — Org input area: Keep `data.scope === 'organization'` here (this is the org-specific input section, which is correct)
3. **Line 348** — N/A view: Change `data.scope === 'organization' && isNa` to `isNa` (show N/A explanation for all scopes)
4. **Line 614** — Scoped entry table: Change `data.scope !== 'organization' && data.scopeLabel` to `data.scope !== 'organization' && data.scopeLabel && !isNa` (hide scoped table when N/A)

This ensures:
- All scope types show the N/A toggle (admin only, not locked)
- Organization scope: toggles between value input and N/A view (unchanged behavior)
- Department/Employee scope: toggles between scoped entry table and N/A view (new behavior)
- N/A remarks textarea is available for all scopes
