

# RCA and CAPA: Admin Corrections Not Visible for Anil Pathak

## Root Cause Analysis

### The Data Trail

| Field | Before Admin Edit | After Admin Edit |
|---|---|---|
| achieved_value | null | 0 |
| self_rating | null | blue (Outstanding) |
| self_score | null | 5 |
| self_remarks | No | No |
| **is_na** | **true** | **true (UNCHANGED)** |
| KPI status | approved | approved |

Admin Jaspal entered valid self-review data at 05:45 UTC today with reason "As per boss". The data was saved correctly to `review_submissions`. However, the `is_na` (Not Applicable) flag was never cleared.

### Why the Dashboard Hides It

The Dashboard score calculation in `Dashboard.tsx` (line 283) explicitly skips any KPI where `is_na === true`:

```text
data.forEach(kpi => {
  const submission = submissionMap.get(kpi.id);
  if (submission?.is_na) return;  // <-- This KPI is skipped entirely
  ...
});
```

The same skip logic exists in `EmployeePerformanceSummary.tsx` (line 154) and `KpiTrackerModal.tsx` (line 57). So the corrected scores (self_score=5) exist in the database but are invisible across all views.

### Root Cause

The Admin Data Entry system (`useAdminDataEntry.ts` -> `buildUpdateFields`) only handles 5 fields:
1. achieved_value
2. rating
3. score
4. remarks
5. evidence_url

It has **no awareness of the `is_na` flag**. The Admin Data Entry Dialog UI also provides **no toggle to clear N/A status**. This means:
- When an admin enters valid data for a KPI that was previously marked N/A, the N/A flag persists
- The dashboard treats it as still not applicable and excludes it from all score calculations and displays

## CAPA: Auto-Clear is_na + Add Manual Toggle

### Fix 1: Auto-clear `is_na` when admin enters achieved value (Backend Logic)

**File: `src/hooks/useAdminDataEntry.ts`**

In the `useAdminSubmitReviewData` mutation, after building update fields, if `achieved_value` is provided (not null/undefined), automatically add `is_na: false` to the upsert payload. This ensures that entering actual data always overrides the N/A flag.

```text
if achieved_value is provided and not null:
  add is_na = false to updateFields
```

### Fix 2: Add N/A toggle to Admin Data Entry Dialog (UI)

**File: `src/components/admin/AdminDataEntryDialog.tsx`**

Add a Switch/Checkbox labeled "Mark as N/A" that:
- Shows the current `is_na` status from the existing submission
- When toggled OFF (unchecked), includes `is_na: false` in the save payload
- When toggled ON (checked), includes `is_na: true` and optionally clears score fields
- This gives admins explicit control over the N/A flag

### Fix 3: Immediate data fix for Anil Pathak's KPI

Run a one-time update to clear the `is_na` flag on the affected submission so the correction becomes visible immediately:

```text
UPDATE review_submissions
SET is_na = false
WHERE kpi_id = '526153d6-0542-4c9a-bca3-835bd98b147b'
```

### Fix 4: Update DOCUMENTATION.md

Record the N/A flag handling in admin data entry.

## Files Modified

| File | Change |
|---|---|
| `src/hooks/useAdminDataEntry.ts` | Auto-clear `is_na` when achieved_value is provided; accept `is_na` parameter |
| `src/components/admin/AdminDataEntryDialog.tsx` | Add N/A toggle switch; pass `is_na` to mutation |
| `DOCUMENTATION.md` | Document N/A handling in admin data entry |
| Database migration | One-time fix for Anil Pathak's submission |

## Risk: Low

- The auto-clear logic is intuitive: if an admin enters an actual value, the KPI is no longer "not applicable"
- The manual toggle gives admins explicit override control
- Existing N/A KPIs without admin edits are unaffected

