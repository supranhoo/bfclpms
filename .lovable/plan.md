

# Fix: Target Values Showing "—" Due to Null vs Undefined Fallback Bug

## Root Cause

A subtle JavaScript type comparison bug prevents the card-level target from being used as a fallback.

In `OrgKpiDataEntry.tsx` (line 382), when no per-employee target is found in `employeeTargetMap`, the code sets:
```
targetValue: empTarget?.target_value ?? null
```

Since `empTarget` is `undefined`, this evaluates to `null`.

Then in `EmployeeRow` (line 194), the fallback logic is:
```
const effectiveTarget = row.targetValue !== undefined ? row.targetValue : targetValue;
```

Since `null !== undefined` is **true**, it uses `null` (the row value) instead of falling back to the card-level `targetValue` prop. The target displays as "---".

Additionally, the `employeeTargetMap` query only fetches targets for KPIs with `org_level_scope === 'employee'`. KPIs with `department` or `organization` scope never populate this map, meaning per-employee targets are never available for those scopes. The card-level target should be the fallback, but the null/undefined bug prevents it.

## Fix (Two Lines)

### 1. `OrgKpiScopedEntryTable.tsx` -- Fix the fallback check

Change the condition from `!== undefined` to `!= null` (which catches both `null` and `undefined`):

```typescript
// Before
const effectiveTarget = row.targetValue !== undefined ? row.targetValue : targetValue;
const effectiveUom = row.uom !== undefined ? row.uom : uom;

// After
const effectiveTarget = row.targetValue != null ? row.targetValue : targetValue;
const effectiveUom = row.uom != null ? row.uom : uom;
```

This ensures that when `row.targetValue` is `null` (no per-employee target found), it correctly falls back to the card-level target value.

### 2. `DOCUMENTATION.md` -- Version bump to 1.45.80

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `OrgKpiScopedEntryTable.tsx`, `DOCUMENTATION.md` |
| Root cause | `null !== undefined` evaluates to `true`, bypassing fallback |
| Data impact | None |
| DB changes | None |
| Regression risk | None -- this makes the existing fallback logic work as intended |
| No refresh button needed | The data is already available via the card-level prop; the bug is purely in the comparison logic |

