

# Fix: Per-Employee Targets All Showing Same Value (Map Serialization Bug)

## Problem

All employee rows display "14 Number" as the target, even though the database stores different targets per employee (14, 35, 70, 140, 315). The fix from v1.45.81 correctly builds a `Map` with per-employee targets, but the targets are lost before reaching the UI.

## Root Cause

React Query uses **structural sharing** by default to optimize re-renders. This process internally serializes and deserializes the query result, which **destroys JavaScript `Map` objects** -- converting them into empty plain objects `{}`. Since `perEmployeeTargetMap` and `employeeKpiIdsMap` are `Map` instances, they become empty objects after React Query processes them. When the code calls `.get()` on the (now-empty) object, it returns `undefined`, and the fallback logic then uses the card-level target (14) for every row.

## Fix

### Option A (Recommended): Convert Maps to plain objects before returning

In `src/hooks/useOrgLevelKpis.ts`, convert the two `Map` instances to plain key-value objects before returning them from `queryFn`. Then update the consumer in `OrgKpiDataEntry.tsx` to use bracket notation `obj[key]` instead of `.get(key)`.

**useOrgLevelKpis.ts** -- Convert Maps to plain objects:
```typescript
// Convert to plain objects for React Query compatibility
const perEmployeeTargets: Record<string, { target_value: number | null; uom: string | null }> = {};
perEmployeeTargetMap.forEach((val, key) => { perEmployeeTargets[key] = val; });

const employeeKpiIds: Record<string, string[]> = {};
employeeKpiIdsMap.forEach((val, key) => { employeeKpiIds[key] = val; });

return { kpis: result, unmappedCount, totalOrgKpis: uniqueMap.size, 
         perEmployeeTargetMap: perEmployeeTargets, employeeKpiIdsMap: employeeKpiIds };
```

**OrgKpiDataEntry.tsx** -- Use bracket notation:
```typescript
const empTarget = employeeTargetMap?.[empTargetKey];
// instead of: employeeTargetMap?.get(empTargetKey)
```

### Version bump

Update `DOCUMENTATION.md` to version **1.45.82**.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `useOrgLevelKpis.ts`, `OrgKpiDataEntry.tsx`, `DOCUMENTATION.md` |
| Root cause | React Query structural sharing serializes Map to {} |
| Data impact | None |
| DB changes | None |
| Regression risk | None -- fixing data transport format |

