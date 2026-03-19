

## RCA: Org KPI Achieved Values Overwritten to NULL by Auto-Save

### Evidence from Database

**Audit Log** (`org_kpi_data_entry_logs`):
On **2026-02-19 at 04:23:22**, all 20+ Manning Norms records were bulk-updated from real values to NULL — all at the same timestamp:

| old_value | new_value |
|-----------|-----------|
| 94 | NULL |
| 89.7 | NULL |
| 90.8 | NULL |
| 88 | NULL |
| 92 | NULL |
| ... (20+ more) | NULL |

**`review_submissions`** still has the correct values (94, 89, 98, 79, etc.) from the original propagation — confirming propagation worked. The data was destroyed ONLY in `org_kpi_values`.

### Root Cause: Race Condition Between Data Loading and Auto-Save

The destructive sequence:

```text
1. Data Owner opens Org KPI Data Entry page
2. useOrgKpiValues() starts fetching (async)
3. BEFORE fetch completes → OrgKpiEntryCard renders
   → scopedValues initialized with NULL achieved values
     (existingValuesMap is empty, so buildCardData returns null)
4. Data Owner expands employee list, edits a REMARK field
   → handleScopedChange('remarks', '1123464/1582940')
   → isDirtyRef.current = TRUE
   → triggerAutoSave() starts 2-second debounce timer
5. useOrgKpiValues() finishes → data.scopedRows now has real values
6. useEffect fires to sync state from DB...
   → BUT isDirtyRef.current is TRUE → early return ← THE BUG
   → scopedValues NEVER updated with the real achieved values
7. Auto-save fires after 2s
   → getValues() returns scopedValues with NULL achieved values
   → bulkUpsert writes NULL to org_kpi_values for ALL 30 employees
   → Real data destroyed ❌
```

**The specific code** (OrgKpiEntryCard.tsx line 161-162):
```typescript
if (!identityChanged) {
  if (isDirtyRef.current) return; // ← Blocks ALL data sync when dirty
```

This guard is designed to prevent the DB from overwriting user edits, but it blocks ALL fields — including `achievedValue` that the user never touched. When the user only edited remarks, the achieved values should still sync from DB.

### Impact

- Any Org KPI with employee/department scope is vulnerable
- If a Data Owner edits any field (remarks, evidence) before initial data loads, ALL achieved values for that KPI are silently destroyed
- The bug is intermittent — depends on network speed and user timing

### Fix (3 layers of protection)

**1. Fix auto-save data merge** (`OrgKpiEntryCard.tsx`)
When `isDirtyRef` is true and data arrives from DB, MERGE the incoming scoped data instead of blocking entirely. Preserve user-edited fields while accepting DB values for untouched fields:

```typescript
if (!identityChanged && isDirtyRef.current) {
  // Merge: update achieved values from DB for rows user hasn't modified
  setScopedValues(prev => prev.map(row => {
    const dbRow = (data.scopedRows || []).find(r => r.scopeId === row.scopeId);
    if (!dbRow) return row;
    // If user hasn't set an achieved value but DB has one, take DB value
    if (row.achievedValue === null && dbRow.achievedValue !== null) {
      return { ...row, achievedValue: dbRow.achievedValue };
    }
    return row;
  }));
  return;
}
```

**2. Prevent destructive null overwrites** (`OrgKpiDataEntry.tsx handleCardSave`)
In the scoped save loop, skip saving a row if it would overwrite a non-null achieved value with null (unless explicitly marked N/A):

```typescript
// Skip if this would destructively overwrite
if (sv.achievedValue === null && !sv.isNa && oldVal !== null) continue;
```

**3. Track per-row dirty state** (`OrgKpiEntryCard.tsx`)
Only auto-save rows the user has actually modified, rather than saving ALL scoped rows on every auto-save.

### Files to Change

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiEntryCard.tsx` | Fix useEffect to merge scoped data when dirty; track per-field modifications |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add guard in handleCardSave to prevent null overwrites of existing values |

