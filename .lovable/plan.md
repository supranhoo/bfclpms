

## Prevent Blank Data Propagation

### Current State

- **Scoped KPIs (department/employee)**: Already guarded — line 564 skips rows where `achievedValue === null && !isNa`. Blank rows are not propagated. ✅
- **Organization-scope KPIs**: No guard — if `achievedValue` is null and `isNa` is false, the propagation proceeds and writes NULL to all employee review submissions. ❌

### What Needs to Change

Add a validation guard at the propagation entry point so that blank data is blocked for ALL scopes, plus show a user-friendly error message.

### Plan

**1. Block blank org-scope propagation** (`src/pages/admin/OrgKpiDataEntry.tsx`)

In `handleCardSaveAndPropagate`, before the `if (scope === 'organization')` block (~line 546), add a guard:

```typescript
// Block propagation of blank data
if (!values.isNa && values.achievedValue === null) {
  toast({
    title: 'Cannot propagate blank data',
    description: 'Please enter an achieved value or mark as N/A before propagating.',
    variant: 'destructive',
  });
  return;
}
```

This single guard covers the organization scope (which was unprotected) and acts as a safety net for scoped KPIs too.

**2. Disable the "Save & Propagate" button when data is blank** (`src/components/admin/OrgKpiEntryCard.tsx`)

Disable the propagate button in the UI when `achievedValue` is null and N/A is not toggled, preventing users from even clicking it with blank data.

### Files to Change

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add early-return guard in `handleCardSaveAndPropagate` for blank values |
| `src/components/admin/OrgKpiEntryCard.tsx` | Disable "Save & Propagate" button when no value entered and not N/A |

