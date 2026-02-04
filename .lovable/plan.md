
# Plan: Add "Assign Owner" Button to Org KPI Data Entry

## Overview

The data owner assignment functionality is fully implemented but missing a UI trigger. This plan adds an "Assign Owner" button to the Org KPI Data Entry table so admins can assign data owners to specific org-level KPIs.

---

## Current State

| Component | Status |
|-----------|--------|
| `org_kpi_data_owners` table | Implemented |
| `useOrgKpiDataOwner` hook | Implemented |
| `OrgKpiOwnerDialog` component | Implemented |
| Dialog state in OrgKpiDataEntry | Implemented (lines 62-63) |
| Dialog rendering | Implemented (lines 712-720) |
| **Trigger button in table** | **MISSING** |

---

## Implementation

### Add "Actions" Column with Assign Owner Button

Add a new column to the table with an action button for each unique KPI (not per-row, since ownership is at the KPI level, not the scoped row level).

**File**: `src/pages/admin/OrgKpiDataEntry.tsx`

### Changes Required

#### 1. Import UserPlus Icon
The icon is not currently imported. Add it to the lucide-react imports:

```typescript
import { Building2, Save, AlertTriangle, Filter, Users, User, Search, X, UserPlus } from 'lucide-react';
```

#### 2. Add Helper to Open Owner Dialog

```typescript
const openOwnerDialog = (categoryId: string, kraName: string, kpiName: string) => {
  setSelectedKpiForOwner({ categoryId, kraName, kpiName });
  setOwnerDialogOpen(true);
};
```

#### 3. Add Actions Column to Table Header

After the "Supporting File" column (line 625), add:

```tsx
{isAdmin && (
  <TableHead className="font-semibold w-20 text-center">Actions</TableHead>
)}
```

#### 4. Add Actions Column to Table Body

After the Supporting File cell (line 700), add an action button:

```tsx
{isAdmin && (
  <TableCell className="text-center">
    <Button
      variant="ghost"
      size="icon"
      onClick={() => openOwnerDialog(kpi.category_id, kpi.kra_name, kpi.kpi_name)}
      title="Assign Data Owner"
    >
      <UserPlus className="h-4 w-4" />
    </Button>
  </TableCell>
)}
```

#### 5. Show Current Owner Badge (Optional Enhancement)

Display who currently owns this KPI by using the `ownershipMap`:

```tsx
// Get ownership info for this KPI
const ownerKey = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}`;
const ownership = ownershipMap.get(ownerKey);
const hasOwner = ownership?.owners?.length > 0;
```

Show a subtle indicator in the Actions cell:

```tsx
{isAdmin && (
  <TableCell className="text-center">
    <div className="flex items-center justify-center gap-1">
      {hasOwner && (
        <Badge variant="outline" className="text-xs">
          {ownership.owners.length} owner{ownership.owners.length > 1 ? 's' : ''}
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => openOwnerDialog(kpi.category_id, kpi.kra_name, kpi.kpi_name)}
        title="Assign Data Owner"
      >
        <UserPlus className="h-4 w-4" />
      </Button>
    </div>
  </TableCell>
)}
```

---

## File Changes

| File | Changes |
|------|---------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add UserPlus import, helper function, Actions column header + body cell |

---

## Visual Result

### Table Header (After):
| Category | KRA | KPI | Employee Name (Code) | Department | Designation | Achieved Value | Remark | Supporting File | Actions |

### Actions Cell Content:
```text
┌──────────────┐
│ [1 owner] 👤 │  ← Badge showing owner count + UserPlus button
└──────────────┘
```

---

## User Flow After Implementation

1. Admin navigates to **Admin > Org KPI Data Entry**
2. Table displays org-level KPIs with an **Actions** column
3. Admin clicks the **UserPlus** icon on any KPI row
4. **OrgKpiOwnerDialog** opens showing:
   - KPI name and KRA
   - Current data owners (if any)
   - Searchable user list to add new owners
5. Admin searches and selects a user to assign as owner
6. User is added to `org_kpi_data_owners` table
7. Badge updates to show owner count

---

## Validation Checklist

After implementation:
- [ ] Actions column appears for admin users only
- [ ] UserPlus button opens the OrgKpiOwnerDialog
- [ ] Dialog shows correct KPI information
- [ ] Owner can be assigned and removed
- [ ] Owner count badge updates correctly
- [ ] Non-admin users do not see the Actions column
