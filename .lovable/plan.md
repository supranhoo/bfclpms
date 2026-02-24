

# Add "Remove from Org KPI" Button on Data Owners Tab (v1.46.1)

## Overview

Add a button next to the "Assign Data Owners" icon on each KPI row in the **Data Owners** tab, allowing admins to remove a KPI from organization-level status (reverting it to a normal KPI).

## What the Button Does

When clicked, the button will:
1. Show a confirmation dialog (since this is a destructive action)
2. On confirm, call the existing `useUnmarkAsOrgLevel` hook which:
   - Sets `is_org_level = false` and `org_level_scope = null` on all matching KPI records
   - Deletes associated `org_kpi_values` for the period
   - Deletes associated `org_kpi_data_owners` entries
3. Show a success toast and refresh the KPI lists

## UI Placement

Each KPI row in the Data Owners tab currently shows:
```
[KPI Name / KRA Name]          [Owner Avatars] [Assign Icon]
```

After this change:
```
[KPI Name / KRA Name]          [Owner Avatars] [Assign Icon] [Remove Icon]
```

The remove button will use a `Trash2` or `XCircle` icon with a destructive ghost style to visually distinguish it from the assign action.

## Technical Changes

### 1. Update `OrgKpiOwnerManagement` component

**File**: `src/components/admin/OrgKpiOwnerManagement.tsx`

- Add `reviewPeriod` and `reviewYear` props (needed by `useUnmarkAsOrgLevel`)
- Import and use `useUnmarkAsOrgLevel` hook
- Add an `AlertDialog` for confirmation before removal
- Add a small destructive ghost button (XCircle icon) next to the existing Users icon button on each KPI row
- On confirm: call `unmark.mutateAsync(...)` with the KPI's `categoryId`, `kraName`, `kpiName`, `reviewPeriod`, and `reviewYear`
- Show toast on success

### 2. Update `OrgKpiDataEntry` page

**File**: `src/pages/admin/OrgKpiDataEntry.tsx`

- Pass `reviewPeriod={selectedPeriod}` and `reviewYear={selectedYear}` to `OrgKpiOwnerManagement`

### 3. Update `DOCUMENTATION.md`

- Bump to v1.46.1
- Document the new "Remove from Org KPI" action on the Data Owners tab

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | Medium | Confirmation dialog prevents accidental clicks. The hook deletes org_kpi_values and data_owner records, which is intentional cleanup |
| Reversibility | Easy | KPI can be re-marked as Org-level from the Suggestions tab |
| Regression | Low | Uses existing `useUnmarkAsOrgLevel` hook already proven on the entry cards |
| RLS | None | No policy changes needed; existing admin policies cover DELETE on org_kpi_values and org_kpi_data_owners |

