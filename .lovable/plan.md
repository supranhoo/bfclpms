

# Fix Import Function to Honor `reviewStatus` Column

## Problem
The `determineReviewStatus` function in `supabase/functions/import-kpis/index.ts` (line 219-224) ignores the explicit `reviewStatus` column from the import file. It always recalculates the status based on which rating fields are present, causing rows marked "Approved" in the file to end up as `kra_set`, `manager_check`, or `audit`.

## Fix

**File:** `supabase/functions/import-kpis/index.ts`

Modify `determineReviewStatus` to check for an explicit `reviewStatus` value first. If the file provides a recognized status, use it directly. Only fall back to the current inference logic when no explicit status is given.

### Status Mapping
The file may contain human-friendly values like "Approved", "Self Review", etc. These will be mapped:

| File Value | Database Status |
|---|---|
| approved | `approved` |
| audit | `audit` |
| manager_check / manager check / manager review | `manager_check` |
| self_review / self review / self-review | `self_review` |
| kra_set / kra set | `kra_set` |

If the value doesn't match any known status, fall back to the existing inference logic.

### Also fix `determineKpiStatus`
Similarly, when `reviewStatus` is explicitly "approved", the `kpiStatus` should be set to `locked` to stay consistent.

## Technical Details

### Current (broken -- line 788)
```typescript
status: determineReviewStatus(row),  // ignores row.reviewStatus
```

### Fixed
```typescript
const determineReviewStatus = (row: KpiImportRow): string => {
  // Honor explicit reviewStatus from file first
  if (row.reviewStatus) {
    const normalized = row.reviewStatus.toLowerCase().trim()
      .replace(/[\s_-]+/g, '_');
    const statusMap: Record<string, string> = {
      'approved': 'approved',
      'audit': 'audit',
      'manager_check': 'manager_check',
      'manager_review': 'manager_check',
      'self_review': 'self_review',
      'kra_set': 'kra_set',
    };
    if (statusMap[normalized]) return statusMap[normalized];
  }
  // Fallback: infer from data
  if (row.auditRating || row.auditTargetAchieved) return 'approved';
  if (row.managerRating || row.managerTargetAchieved) return 'audit';
  if (row.employeeRating || row.employeeTargetAchieved || row.targetAchieved) return 'manager_check';
  return 'kra_set';
};
```

Same pattern applied to `determineKpiStatus` -- if `reviewStatus` says "approved", return `'locked'`.

## Files Modified
1. **`supabase/functions/import-kpis/index.ts`** -- update `determineReviewStatus` and `determineKpiStatus` functions
2. **`DOCUMENTATION.md`** -- document that `reviewStatus` column is honored during import

