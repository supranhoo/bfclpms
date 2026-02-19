
# Fast Track to Approved — Admin Bulk Stage Completion

## Problem Statement

Ashish Kataria's 8 December KPIs are stuck at `self_review`. His workflow is:
`kra_set → self_review → manager_check → skip_level_check → hr_pms_review → approved`

To move each KPI to `approved` currently requires **3 separate Admin Data Entry saves** (Manager, Skip-Level, HR PMS) × 8 KPIs = **24 manual operations**. The dialog has no way to advance multiple stages at once.

The user has tried this repeatedly and it is not working because they likely save the "Self" level each time (which correctly doesn't change status since it's already at `self_review`), or they try Manager but must repeat for Skip-Level and HR PMS separately.

## Root Cause Confirmed

- All 8 KPIs: `status = self_review`, `self_rating = red`, `self_score = 0`
- `manager_rating`, `skip_level_rating`, `hr_pms_rating` are ALL NULL
- `final_rating`, `final_score` are ALL NULL
- Ashish's workflow has 3 remaining stages before `approved`: manager_check, skip_level_check, hr_pms_review

## Solution: "Fast Track to Approved" Button

Add a dedicated **"Fast Track to Approved"** button to the Admin Data Entry dialog that:

1. Fills all **remaining review stage fields** (manager, skip_level, hr_pms) with the same score/rating
2. Sets the KPI status directly to `approved`
3. Syncs `final_rating` and `final_score`
4. Creates a single audit log entry documenting the bulk action
5. Sends one employee notification

This is the cleanest fix — no UI navigation required. The admin picks the rating, enters one reason, clicks one button.

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useAdminDataEntry.ts` | Add new `useAdminFastTrackApprove` hook |
| `src/components/admin/AdminDataEntryDialog.tsx` | Add "Fast Track to Approved" section at the bottom, visible only when KPI is not yet `approved` and has remaining review stages |
| `DOCUMENTATION.md` | Version bump to 1.45.34 |

## Technical Detail

### New Hook — `useAdminFastTrackApprove`

```ts
export interface AdminFastTrackParams {
  kpi_id: string;
  employee_id: string;
  rating: RatingLevel;
  score: number;
  achieved_value: number | null;
  reason: string;
  kpi_name: string;
  remaining_stages: AdminRoleLevel[];  // e.g. ['manager', 'skip_level', 'hr_pms']
}
```

The mutation:
1. Builds a single update object covering ALL remaining role-level fields at once:
   - `manager_rating`, `manager_score`, `manager_achieved_value`
   - `skip_level_rating`, `skip_level_score`, `skip_level_achieved_value`
   - `hr_pms_rating`, `hr_pms_score`, `hr_pms_achieved_value`
   - `final_rating`, `final_score`
   - `kpi_status = 'submitted'`
2. Upserts into `review_submissions` in one call
3. Updates `kpis.status = 'approved'` directly (no intermediate steps)
4. Creates audit log with action `ADMIN_FAST_TRACK_APPROVED`
5. Sends employee notification

### UI Addition in AdminDataEntryDialog

Below the existing "Advance workflow status" toggle, add a collapsible "Fast Track" section:

```
┌─────────────────────────────────────────────────┐
│ ⚡ Fast Track to Approved                        │
│ Remaining stages: Manager, Skip-Level, HR PMS    │
│                                                  │
│ Apply score: [0 ▼]  Rating: [Not Achieved ▼]    │
│                                                  │
│ ☐ I confirm this fills all remaining stages     │
│   and marks this KPI as Approved                │
│                                                  │
│ [Fast Track Approve]                            │
└─────────────────────────────────────────────────┘
```

**Visibility conditions:**
- KPI has `status !== 'approved'`
- There are remaining workflow stages (at least one of: manager, skip_level, hr_pms that has no data yet)

**Guard:**
- Requires the confirmation checkbox to be checked
- Requires the reason field to be filled

### How This Fixes Ashish's Specific Case

For each of the 8 stuck KPIs:
1. Admin opens "Admin Data Entry"
2. Scrolls to "Fast Track to Approved"
3. Score is already pre-filled as 0 / Not Achieved (from Quick Fill state)
4. Checks the confirmation box
5. Clicks "Fast Track Approve"
6. KPI jumps from `self_review` → `approved` in one action

8 KPIs × 1 click each = **8 operations** instead of 24.

Alternatively, we can also add a **"Bulk Fast Track"** button on the All KPIs employee expanded view to do all 8 in one click — but that is a larger scope. The per-KPI Fast Track alone solves the immediate problem.

## Expected Outcome

| Scenario | Before | After |
|---|---|---|
| Move self_review KPI to approved (3-stage workflow) | 3 separate admin saves per KPI | 1 "Fast Track" click per KPI |
| Ashish's 8 stuck KPIs | ~24 manual operations | 8 clicks |
| Audit trail | One entry per role level | Single `ADMIN_FAST_TRACK_APPROVED` entry |
| Employee notification | 3 notifications per KPI | 1 notification per KPI |
