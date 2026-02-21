

# RCA & Fix: Admin-Marked N/A KPI Missing `na_marked_by_role` + Status Display Issue

## Root Cause Analysis

### What Happened (Ashish Kataria's SOP KPI)

1. The Org KPI "SOP/SMP Creation & Implementation" was **propagated** to Ashish Kataria for January 2026 with `achieved_value = 0` (not N/A). The propagation RPC advanced the KPI status from `kra_set` to `self_review`.
2. An admin later used the **Admin Data Entry Dialog** to mark this KPI as N/A. This set `is_na = true` in `review_submissions` but:
   - **Bug 1**: Did NOT set `na_marked_by_role` to `'admin'` (left it as NULL)
   - **Bug 2**: The status remained at `self_review` because the admin data entry logic does not handle N/A-specific status transitions

### Why the Status Shows "Self Review"

The KPI status is `self_review` (set by the original propagation). The Admin Data Entry dialog does not change the KPI status when toggling N/A -- it only updates the `review_submissions` row. So the KPI appears as "Self Review" even though it's been marked N/A by the admin.

**This is NOT the expected behavior.** When an admin marks a KPI as N/A, the intent is typically to exclude it from scoring entirely. The KPI should either:
- Stay at its current status (letting the normal workflow handle it, with reviewers seeing the N/A flag), OR
- Be fast-tracked to `approved` if the admin wants to close it out

Currently, the 32 KPIs at `self_review` with `na_marked_by_role = 'employee'` are **correct** -- employees marked them N/A during self-review, and they're waiting for manager review. The 1 KPI with `na_marked_by_role = NULL` is the bug.

### Similar Bug Locations

The `na_marked_by_role` field is correctly set in:
- `propagate_org_kpi_value` RPC: Sets `'admin'` when `p_is_na = true` (correct)
- `SelfReviewSheet`: Sets `'employee'` (correct)
- `UnifiedScorecard`: Sets the reviewer's role (correct)

But **NOT** set in:
- `useAdminDataEntry.ts` (line 135-139): Only sets `is_na` flag, never sets `na_marked_by_role`

## Fix Plan

### 1. Fix `useAdminDataEntry.ts` -- Set `na_marked_by_role` when admin toggles N/A

In the `useAdminSubmitReviewData` hook (lines 133-139), when `is_na` is set to `true`, also set `na_marked_by_role = 'admin'`. When `is_na` is set to `false`, clear `na_marked_by_role = null`.

```typescript
// Current (broken):
if (is_na !== undefined) {
  updateFields.is_na = is_na;
}

// Fixed:
if (is_na !== undefined) {
  updateFields.is_na = is_na;
  updateFields.na_marked_by_role = is_na ? 'admin' : null;
}
```

### 2. Data Correction -- Fix Ashish Kataria's KPI

Run a one-time SQL migration to set `na_marked_by_role = 'admin'` on any `review_submissions` row where `is_na = true` but `na_marked_by_role` is NULL:

```sql
UPDATE review_submissions
SET na_marked_by_role = 'admin'
WHERE is_na = true AND na_marked_by_role IS NULL;
```

### 3. Update DOCUMENTATION.md

Version bump to 1.45.51 with a note about the admin N/A fix.

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Set `na_marked_by_role` when toggling N/A |
| `DOCUMENTATION.md` | Version bump to 1.45.51 |
| Database migration | Correct existing NULL `na_marked_by_role` records |

## Impact

- Admin-initiated N/A will now correctly identify the admin as the marking role
- The N/A confirmation card in reviewer views will display "by Admin" instead of showing no attribution
- No breaking changes to any other workflow

## Note on Status Behavior

The KPI remaining at `self_review` after admin marks N/A is **by design** of the Admin Data Entry dialog -- it advances status based on the role level selected, not the N/A flag. If the admin selected "Self" level and the KPI was already at `self_review`, no status change occurs. This is acceptable because the N/A flag will be visible to reviewers at each subsequent stage, and they can confirm or override it through the normal workflow.

