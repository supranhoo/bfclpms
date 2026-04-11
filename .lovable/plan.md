

## RCA: Compliance Sub-Factors Missing for Most Employees

### Database Evidence

| Metric | Value |
|--------|-------|
| Total March compliance rows (employee-scoped) | 78 |
| Rows WITH `sub_factors` | 11 |
| Rows WITHOUT `sub_factors` | 67 |
| Rows created before today (Apr 9) | 65 (10 with SF, 55 without) |
| Rows created today | 13 (1 with SF, 12 without) |

The 10 older rows with sub_factors were **updated today at ~15:46** (after the save fix deployed). The 55 without sub_factors were last updated at ~16:10 — achieved values saved but sub_factors not included.

### Root Cause: `useEffect` Dependency Bug in `OrgKpiEntryCard.tsx`

**File:** `src/components/admin/OrgKpiEntryCard.tsx`, lines 179–224

The `useEffect` that initializes `scopedValues` state has this dependency array (line 224):

```text
[data.achievedValue, data.remarks, data.evidenceUrl, 
 data.categoryId, data.kraName, data.kpiName, reviewPeriod, reviewYear]
```

**Missing dependency: `data.scopedRows`** — specifically the sub_factors within it.

**Failure sequence:**

1. Card mounts → query still loading → `existingValuesMap` is empty
2. `data.scopedRows` computed with `subFactors: undefined` for all employees
3. `useEffect` fires (identity changed) → `setScopedValues(data.scopedRows)` → all subFactors = undefined
4. Query completes → `data.scopedRows` now includes subFactors from DB
5. But for employee-scoped KPIs, `data.achievedValue` stays `null` (no org-level value)
6. **useEffect does NOT re-fire** because none of its dependencies changed
7. `scopedValues` remains stale — UI shows blank sub-factor fields
8. HR sees empty fields, re-enters data for some employees, but doesn't notice the others are also blank
9. Auto-save fires with `subFactors: undefined` for untouched employees → DB preserved (undefined guard works), but the UI never shows the correct values

**Result:** The DB data is actually intact for the 11 rows that were manually entered. The other 67 rows never had sub_factors saved because:
- 55 were created before the save-fix was deployed
- 12 were created today but sub_factors weren't entered because the UI showed blank (stale state)

### Fix Plan

| # | File | Change |
|---|------|--------|
| 1 | `OrgKpiEntryCard.tsx` | Add a secondary `useEffect` that merges `data.scopedRows` sub_factors + achievedValue into `scopedValues` state when they become available, without resetting user-dirty fields |
| 2 | `OrgKpiDataEntry.tsx` | Add a one-time data repair: for employees with existing `org_kpi_values` rows but null `sub_factors`, pre-populate default sub_factors from the card UI |
| 3 | `DOCUMENTATION.md` | RCA note + fix description |
| 4 | `POLICY.md` | Version sync |

### Technical Detail

**Fix 1 — Merge effect** (primary fix):
```typescript
// New useEffect in OrgKpiEntryCard.tsx after the existing one
useEffect(() => {
  if (!data.scopedRows?.length || isDirtyRef.current) return;
  setScopedValues(prev => {
    if (prev.length !== data.scopedRows!.length) return data.scopedRows!;
    let changed = false;
    const merged = prev.map(row => {
      const dbRow = data.scopedRows!.find(r => r.scopeId === row.scopeId);
      if (!dbRow) return row;
      // Merge subFactors and achievedValue from DB if local is stale
      const needsMerge = 
        (row.subFactors === undefined && dbRow.subFactors !== undefined) ||
        (row.achievedValue === null && dbRow.achievedValue !== null);
      if (needsMerge) {
        changed = true;
        return { ...row, 
          subFactors: row.subFactors ?? dbRow.subFactors,
          achievedValue: row.achievedValue ?? dbRow.achievedValue,
        };
      }
      return row;
    });
    return changed ? merged : prev;
  });
}, [data.scopedRows]);
```

This ensures that when the query completes and `data.scopedRows` gains subFactors from DB, they are merged into the card's local state without resetting any user edits.

### Risk Assessment
- **Data impact**: None — additive merge; never overwrites user-entered values
- **Regression risk**: Low — guarded by `isDirtyRef` check to avoid merge during active editing
- **UI/UX**: Sub-factors will now correctly display after initial query load

