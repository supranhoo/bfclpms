

# Fix: Org KPI Self-Entry Lock Should Exempt Data Owners

## Current Behavior (Switch OFF)
- `isOrgLocked = isSelectedKpiOrgLevel && !orgKpiSelfEntryAllowed`
- This blanket-locks every employee, including someone who is both an employee AND a Data Owner for that specific KPI.

## Correct Behavior

| Scenario | Switch OFF | Switch ON |
|---|---|---|
| Regular employee, org KPI | **Locked** — sees "Data Owner will enter" | Allowed to self-enter |
| Employee who IS Data Owner for this KPI | **Allowed** — they are the designated provider | Allowed |
| Admin | Always allowed | Always allowed |

## Fix: `SelfReviewSheet.tsx` (1 line change)

Import `useIsOrgKpiDataOwner` and check if the current user is the Data Owner for the selected KPI. If they are, skip the lock:

```typescript
const { data: ownerCheck } = useIsOrgKpiDataOwner(
  selectedKpi?.category_id || '',
  selectedKpi?.kra_name || '',
  selectedKpi?.kpi_name || ''
);

const isOrgLocked = isSelectedKpiOrgLevel 
  && !orgKpiSelfEntryAllowed 
  && !ownerCheck?.canEdit;  // Data Owners & Admins bypass the lock
```

This uses the existing `useIsOrgKpiDataOwner` hook which already returns `{ canEdit: true }` for admins and designated Data Owners.

**1 file, ~5 lines changed. No DB migration.**

