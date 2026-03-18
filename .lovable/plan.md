

## RCA: "Data by" Badge Missing on Some Org KPIs

### Root Cause
**Case-sensitive key matching** in `EmployeeScorecard.tsx` and `ManagementScorecard.tsx`.

The lookup map that matches org KPI values to employee KPIs uses `kra_name` and `kpi_name` as-is (case-sensitive). If the org KPI value was entered with slightly different casing than the employee's KPI record (e.g., "Costing" vs "costing"), the lookup fails and `entered_by_name` is never resolved — so the "Data by" badge doesn't appear.

**`UnifiedScorecard.tsx` already has the fix** — it uses `.toLowerCase()` on both the map keys and the lookup keys. The other two scorecards were never updated to match.

### Evidence from Code

| Scorecard | Map Key | Lookup Key | Case-Insensitive? |
|-----------|---------|------------|-------------------|
| `UnifiedScorecard.tsx` (line 272) | `.toLowerCase()` | `.toLowerCase()` | Yes |
| `EmployeeScorecard.tsx` (line 114) | raw | raw | **No** |
| `ManagementScorecard.tsx` (line 116) | raw | raw | **No** |

### Fix

Apply `.toLowerCase()` to `kra_name` and `kpi_name` in both the map-building and lookup logic in:

1. **`src/components/review/EmployeeScorecard.tsx`** — lines 114 and 126-132
2. **`src/components/review/ManagementScorecard.tsx`** — lines 116 and 128-134

Match the pattern already used in `UnifiedScorecard.tsx`:
```typescript
// Map building
const key = `${v.category_id}||${v.kra_name.toLowerCase()}||${v.kpi_name.toLowerCase()}||${deptPart}||${empPart}`;

// Lookup
key = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}||...`;
```

Two lines changed per file, four lines total.

