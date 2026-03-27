

## Fix: KRA Library Search Clears KRA/KPI Names on Selection

### Root Cause
When `onSelectKpi` fires, it calls `setCategoryId`, `setKraName`, `setKpiName` in sequence. However, two `useEffect` hooks react to these state changes:
1. `useEffect([categoryId])` → resets `kraName` and `kpiName` to `''`
2. `useEffect([kraName])` → resets `kpiName` to `''`

These cascading resets wipe out the KRA and KPI names that were just set by the library search selection.

### Fix — `src/components/admin/AdminKpiCreateDialog.tsx`

1. Add a `useRef` flag: `const skipResetRef = useRef(false)`
2. In both useEffects, check `if (skipResetRef.current) { skipResetRef.current = false; return; }` before resetting
3. In `onSelectCategory`, `onSelectKra`, and `onSelectKpi` handlers, set `skipResetRef.current = true` before calling `setCategoryId`/`setKraName`
4. For the `kraName` useEffect, also guard with the ref since `setKraName` from the library should not wipe `kpiName`

### Risk Assessment
- **Data Impact**: None
- **Regression Risk**: Zero — only prevents spurious resets; manual dropdown selection still resets as before since the ref won't be set

### Files Changed
1. `src/components/admin/AdminKpiCreateDialog.tsx` — Add skip-reset ref guard

