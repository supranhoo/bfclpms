

# Fix: N/A KPIs Show "Pending" Status Even After Save/Propagation

## Problem

When all employees in a scoped KPI are marked as N/A, the card always shows **"Pending"** even after saving and propagating. This happens because:

1. N/A entries store `achieved_value = null` in the database (by design -- there's no numeric value for N/A)
2. The `getKpiStatus` helper only considers entries where `achieved_value` is NOT null
3. Since all N/A entries have null values, the helper finds zero matching entries and returns `'pending'`

The same bug exists in the progress statistics calculation (entered/propagated counts), which also filters on `achieved_value !== null`.

## Root Cause (Technical)

In `src/pages/admin/OrgKpiDataEntry.tsx`, three places filter entries using `v.achieved_value !== null`:

- **`getKpiStatus`** (line 166, 173): Determines the card badge (Pending/Entered/Propagated)
- **Progress stats `useMemo`** (line 279, ~285): Calculates entered/propagated counts for the header
- **Data owner tiles** (line 219): Determines per-owner completion ratios

All three need to also consider `v.is_na === true` as a valid "entered" state.

## Fix

**File: `src/pages/admin/OrgKpiDataEntry.tsx`**

Update the value-presence check in all three locations to include N/A entries:

### 1. `getKpiStatus` helper (lines 161-179)

For organization scope (line 166):
```typescript
// BEFORE:
if (val?.achieved_value !== null && val?.achieved_value !== undefined) {

// AFTER:
if ((val?.achieved_value !== null && val?.achieved_value !== undefined) || val?.is_na) {
```

For department/employee scope (line 173):
```typescript
// BEFORE:
k.startsWith(prefix) && v.achieved_value !== null && v.achieved_value !== undefined

// AFTER:
k.startsWith(prefix) && (v.achieved_value !== null && v.achieved_value !== undefined || v.is_na)
```

### 2. Progress stats calculation (~lines 276-291)

Same pattern -- include `is_na` entries in the entered/propagated count.

### 3. Data owner tile completion (~line 219)

Same pattern -- count N/A entries as "entered".

## Impact

- N/A-only KPIs will correctly show **"Entered"** after saving and **"Propagated"** after propagation
- Progress bars and completion ratios will accurately include N/A entries
- Data owner tiles will show correct completion counts
- No data or schema changes required -- display-only fix

## Risk Assessment

| Aspect | Risk | Notes |
|--------|------|-------|
| Data | None | Read-only display logic |
| Regression | None | Only adds N/A awareness to existing status checks |
| Consistency | Improved | N/A entries are treated as valid data entries across the board |

## Files Changed

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Update 3 locations to treat `is_na = true` entries as valid (not pending) |

