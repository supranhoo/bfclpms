
# Test Results & Fix Plan: Org KPI Data Entry (Phases 1-5)

## Test Summary

| Feature | Phase | Status | Notes |
|---|---|---|---|
| Card-based UI layout | 1 | Working | Cards render with KPI name, KRA, target, UOM, scope |
| Category pill tabs | 1 | Working | All 12 categories shown with counts |
| Category grouping | 1 | Working | KPIs grouped under category headers with "X/Y entered" |
| Progress bar | 1 | Bug | Always shows 0 for department/employee-scoped KPIs |
| Per-card Save/Propagate buttons | 1 | Working | Visible on each card |
| History button (Audit popover) | 4 | Working | Opens popover with "Value History" title |
| Impact button | 1 | Working | Visible on each card |
| Search bar | 1 | Working | Renders, filters KPIs |
| Period/Year selector | 1 | Working | Renders and functions |
| Auto-save (2s debounce) | 2 | Bug | Saves null instead of typed value (stale closure) |
| Save status indicator | 2 | Partial | Not visible because auto-save fires and resets before user can see it |
| Copy from Last Period button | 2 | Working | Button visible in header |
| Export Template button | 3 | Working | Button visible in header |
| Import Excel button | 3 | Working | Button visible in header |
| Audit log table | 4 | Working | Table exists in database, RLS enabled |
| Data Owners tab | 5 | Working | Shows categories with owner counts, bulk assign UI |
| Bulk assign to category | 5 | Working | "Assign owner to ALL X KPIs" with user selector |

## Critical Bugs Found

### Bug 1: Auto-Save Stale Closure (Phase 2) -- HIGH PRIORITY

**Problem**: When a user types a value (e.g., "85") and the 2-second auto-save fires, it saves `null` instead of the typed value.

**Root Cause**: Classic React stale closure. In `OrgKpiEntryCard.tsx`:
1. `onChange` calls `setAchievedValue(e.target.value)` then `triggerAutoSave()`
2. `triggerAutoSave` creates a `setTimeout` that calls `getValues()`
3. But `getValues` is a `useCallback` that captured the OLD `achievedValue` (before `setState` re-rendered)
4. The setTimeout fires 2 seconds later, but it still holds the old `getValues` reference

**Fix**: Use a ref to always access the latest values:
- Store `achievedValue`, `remarks`, `evidenceUrl`, `scopedValues` in refs
- Have `getValues` read from refs instead of state
- This ensures the setTimeout always reads the current values

### Bug 2: Progress Bar Ignores Scoped Values (Phase 1) -- MEDIUM PRIORITY

**Problem**: Progress bar shows "0 of 33 KPIs Entered" even when department-scoped KPIs have values entered.

**Root Cause**: In `OrgKpiDataEntry.tsx` line 144, the progress lookup key always uses `||null||null`, which only matches org-wide records. Department-scoped records have a department_id in the key.

**Fix**: For department/employee-scoped KPIs, check if ANY scoped row for that KPI has a non-null achieved_value, rather than only checking the org-wide key.

## Fixes Required

### File: `src/components/admin/OrgKpiEntryCard.tsx`

Add refs to track current values and fix the stale closure:

```typescript
// Add refs alongside state
const achievedValueRef = useRef(achievedValue);
const remarksRef = useRef(remarks);
const evidenceUrlRef = useRef(evidenceUrl);
const scopedValuesRef = useRef(scopedValues);

// Keep refs in sync with state
useEffect(() => { achievedValueRef.current = achievedValue; }, [achievedValue]);
useEffect(() => { remarksRef.current = remarks; }, [remarks]);
useEffect(() => { evidenceUrlRef.current = evidenceUrl; }, [evidenceUrl]);
useEffect(() => { scopedValuesRef.current = scopedValues; }, [scopedValues]);

// getValues reads from refs (always current)
const getValues = useCallback(() => {
  const parsed = achievedValueRef.current === '' ? null : parseFloat(achievedValueRef.current);
  return {
    achievedValue: isNaN(parsed as number) ? null : parsed,
    remarks: remarksRef.current,
    evidenceUrl: evidenceUrlRef.current,
    scopedValues: data.scope !== 'organization'
      ? scopedValuesRef.current.map(s => ({ ... }))
      : undefined,
  };
}, [data.scope]); // no longer depends on state values
```

### File: `src/pages/admin/OrgKpiDataEntry.tsx`

Fix progress calculation to handle scoped KPIs:

```typescript
ownershipFilteredKpis.forEach(kpi => {
  const scope = (kpi as any).org_level_scope || 'organization';
  cat.total++;

  if (scope === 'organization') {
    // Check org-wide key
    const key = `${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||null||null`;
    const val = existingValuesMap.get(key);
    if (val?.achieved_value != null) { enteredKpis++; cat.entered++; }
  } else {
    // Check if ANY scoped row has a value
    const hasAnyValue = Array.from(existingValuesMap.entries()).some(([k, v]) =>
      k.startsWith(`${kpi.category_id}||${kpi.kra_name}||${kpi.kpi_name}||`) &&
      v.achieved_value != null
    );
    if (hasAnyValue) { enteredKpis++; cat.entered++; }
  }
});
```

### File: `DOCUMENTATION.md`

Update to document the ref-based auto-save pattern.

## Test Data Cleanup

The test created one record with null achieved_value that should be cleaned up:
- `org_kpi_values` ID: `82a09304-cca8-4b2c-b46e-6d30d8c1ff70` (Adherence to Manning Norms with null value)
