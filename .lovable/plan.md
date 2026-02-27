

# Fix: Employee-Scoped KPI Status Always Shows "Pending" After Propagation

## Root Cause

The `buildCardData` function in `OrgKpiDataEntry.tsx` determines the card status using a lookup key of `${categoryId}||${kraName}||${kpiName}||null||null`. This key only matches **organization-scoped** KPIs in the `existingValuesMap`.

For **employee-scoped** KPIs (like "Zero Fatal"), the values are stored with employee-specific keys (e.g., `...||null||${employeeId}`), so the lookup returns `undefined` and status defaults to `'pending'` — even after propagation.

Interestingly, a correct implementation already exists in the `getKpiStatus` helper (lines 161-179), which checks all matching entries by prefix. But `buildCardData` does not use it.

## Fix

**File: `src/pages/admin/OrgKpiDataEntry.tsx`** -- `buildCardData` function (around lines 326-330)

Replace the inline status logic with a call to the existing `getKpiStatus` helper, which already handles all three scopes correctly:

```typescript
// BEFORE (broken for non-org scopes):
let status: 'pending' | 'entered' | 'propagated' = 'pending';
if (existing?.achieved_value !== null && existing?.achieved_value !== undefined) {
  status = existing?.status === 'propagated' ? 'propagated' : 'entered';
}

// AFTER (reuse existing helper):
const status = getKpiStatus(kpi);
```

This single-line change eliminates the duplicated (and incomplete) status logic and ensures all scopes (organization, department, employee) correctly reflect Pending, Entered, and Propagated states.

## Impact

- Employee-scoped KPIs will correctly show "Propagated" (green badge) after propagation
- Department-scoped KPIs will also benefit from the same fix
- Organization-scoped KPIs continue to work as before (the helper uses the same logic)
- No data or schema changes required -- display-only fix

## Risk Assessment

| Aspect | Risk | Notes |
|--------|------|-------|
| Data | None | Read-only display logic |
| Regression | None | `getKpiStatus` already powers filtering and progress stats correctly |
| Consistency | Improved | Single source of truth for status derivation |

## Files Changed

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Replace inline status logic in `buildCardData` with call to `getKpiStatus(kpi)` |

