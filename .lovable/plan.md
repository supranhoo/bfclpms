

# Fix: Manager Approved Values Not Saved for All Daily Entries

## Problem Identified

When a Manager reviews and approves a Daily Binary KPI, the `manager_achieved_value` column in `sub_period_submissions` remains `null` for most entries. This causes the "Manager Approved" column in the Audit Review's Daily Submission Summary to show dashes (—) instead of actual values.

### Root Cause

The current implementation has a gap in the approval flow:

| Scenario | Current Behavior | Expected Behavior |
|----------|-----------------|-------------------|
| Manager Agrees | Calls `acceptEmployeeValues` to copy all values | Correct |
| Manager Disagrees | Only updates entries IN the override Map | Updates ALL entries - overridden ones with new value, non-overridden ones with employee's value |

When a manager disagrees and overrides specific dates (e.g., 4 out of 31 days), only those 4 dates get `manager_achieved_value` set. The remaining 27 days are left with `null` values.

---

## Solution

Modify the `saveOverrides` mutation in `useManagerSubPeriodOverride.ts` to:

1. Save override values for modified dates (current behavior)
2. **Also** copy `achieved_value` to `manager_achieved_value` for all non-overridden dates

### Technical Implementation

**File: `src/hooks/useManagerSubPeriodOverride.ts`**

Update the `saveOverrides` mutation to populate `manager_achieved_value` for all entries:

```typescript
// After processing overrides, update remaining entries to copy employee values
const { data: allSubmissions, error: fetchAllError } = await supabase
  .from('sub_period_submissions')
  .select('id, achieved_value, sub_period_value')
  .eq('kpi_id', kpi_id)
  .eq('review_month', review_month)
  .eq('review_year', review_year);

if (fetchAllError) throw fetchAllError;

// Get the dates that were overridden
const overriddenDates = new Set(overrides.map(o => o.sub_period_value));

// Update non-overridden entries to copy achieved_value to manager_achieved_value
for (const sub of allSubmissions || []) {
  if (!overriddenDates.has(sub.sub_period_value) && sub.achieved_value !== null) {
    const { error: copyError } = await supabase
      .from('sub_period_submissions')
      .update({
        manager_achieved_value: sub.achieved_value,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id);
    
    if (copyError) throw copyError;
  }
}
```

### Same Fix for Auditor/Management Levels

Apply the same pattern to `useReviewerSubPeriodOverride.ts` for the `saveOverrides` mutation:

- When auditor disagrees → copy all `manager_achieved_value` to `auditor_achieved_value` except overridden dates
- When management disagrees → copy all `auditor_achieved_value` to `management_achieved_value` except overridden dates

---

## Data Migration for Existing Records

Since the KPI was approved today but the values weren't saved, we need to backfill using the audit trail. The audit log shows:

```
action: MANAGER_DAILY_OVERRIDE
metadata:
  overrides: [
    {date: "2026-01-01", to: 5},
    {date: "2026-01-02", to: 0},
    {date: "2026-01-04", to: 5},
    {date: "2026-01-06", to: 5}
  ]
```

**Backfill Strategy:**
1. Query `kpi_audit_logs` for `MANAGER_DAILY_OVERRIDE` entries
2. For each affected KPI, get all `sub_period_submissions`
3. Apply overridden values from audit metadata
4. Copy `achieved_value` to `manager_achieved_value` for non-overridden dates

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useManagerSubPeriodOverride.ts` | Update `saveOverrides` to populate ALL entries |
| `src/hooks/useReviewerSubPeriodOverride.ts` | Update `saveOverrides` to populate ALL entries for auditor/management levels |
| `DOCUMENTATION.md` | Update to reflect the complete value propagation behavior |

---

## Validation

After the fix:

1. When a Manager approves a Daily Binary KPI (whether agreeing or overriding), ALL daily submissions will have `manager_achieved_value` populated
2. The Auditor will see complete "Manager Approved" column data
3. Same behavior cascades to Auditor → Management flow

---

## Testing Checklist

1. **Manager Agrees Flow**
   - [x] All entries get `manager_achieved_value` = `achieved_value`

2. **Manager Disagrees Flow**
   - [x] Overridden entries get new value in `manager_achieved_value`
   - [x] Non-overridden entries get `achieved_value` copied to `manager_achieved_value`

3. **Auditor Review Display**
   - [x] Manager Approved column shows values for all dates
   - [x] Changed values show visual diff badge

4. **Data Backfill**
   - [x] Migration completed: Updated KPI 77bcb484 with all manager_achieved_value populated using audit trail

## Implementation Complete ✅

All tasks have been implemented and data backfilled.

